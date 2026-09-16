using PropSherpa.Api.Features.Props;
using PropSherpa.Api.Integrations.Sleeper;
using PropSherpa.Api.Matching;

namespace PropSherpa.Api.Features.Lineups;

/// <summary>
/// Joins a Sleeper roster to the cached odds.
///
/// Reads only from caches - never from Sleeper - so a page load costs nothing and pulling fresh
/// data stays an explicit act.
/// </summary>
public class LineupBuilder
{
    private readonly PropCache _props;
    private readonly SleeperLeagueCache _leagues;
    private readonly SleeperPlayerDirectory _directory;
    private readonly IPlayerMatcher _matcher;
    private readonly ILogger<LineupBuilder> _logger;

    public LineupBuilder(
        PropCache props,
        SleeperLeagueCache leagues,
        SleeperPlayerDirectory directory,
        IPlayerMatcher matcher,
        ILogger<LineupBuilder> logger)
    {
        _props = props;
        _leagues = leagues;
        _directory = directory;
        _matcher = matcher;
        _logger = logger;
    }

    /// <summary>One team's lineup, or null when no odds have been cached yet.</summary>
    public async Task<LineupResponse?> BuildAsync(
        string leagueId,
        int? rosterId,
        CancellationToken ct = default)
    {
        var snapshot = await _props.GetAsync(ct);
        if (snapshot is null) return null;

        var league = await _leagues.GetAsync(leagueId, ct);
        var resolver = await CreateResolverAsync(snapshot, ct);

        var roster = rosterId is { } id
            ? league.Rosters.FirstOrDefault(r => r.RosterId == id)
            : league.Rosters.OrderBy(r => r.RosterId).FirstOrDefault();

        if (roster is null) return null;

        var startingSlots = RosterSlots.StartingSlots(league.League.RosterPositions);
        var team = BuildTeam(league, roster, startingSlots, resolver);

        return new LineupResponse(
            League: new LineupLeague(
                leagueId,
                league.League.Name,
                league.League.Season,
                league.Week,
                LeagueScoring.From(league.League.ScoringSettings),
                startingSlots.Select(RosterSlots.DisplayName).ToList(),
                league.Rosters
                    .OrderBy(r => r.RosterId)
                    .Select(r => new LineupTeamSummary(r.RosterId, TeamNameFor(league, r), ManagerFor(league, r)))
                    .ToList()),
            Team: team,
            PropsRetrievedAt: snapshot.RetrievedAt,
            RostersRetrievedAt: league.RetrievedAt,
            PlayersRetrievedAt: _directory.LastDownloaded,
            Books: snapshot.Books,
            UnmatchedStarters: team.Slots.Count(slot => slot.Starter is { Props: null }));
    }

    /// <summary>Match rates per team, so a silent regression in name matching stays visible.</summary>
    public async Task<object?> BuildCoverageAsync(string leagueId, CancellationToken ct = default)
    {
        var snapshot = await _props.GetAsync(ct);
        if (snapshot is null) return null;

        var league = await _leagues.GetAsync(leagueId, ct);
        var resolver = await CreateResolverAsync(snapshot, ct);
        var startingSlots = RosterSlots.StartingSlots(league.League.RosterPositions);

        var teams = league.Rosters.OrderBy(r => r.RosterId)
            .Select(roster => BuildTeam(league, roster, startingSlots, resolver))
            .ToList();

        var starters = teams.SelectMany(t => t.Slots).Select(s => s.Starter).OfType<LineupPlayer>().ToList();

        // Reserve and taxi are separate lists, so counting only Bench would under-report the roster.
        var rostered = teams
            .SelectMany(t => t.Slots.Select(s => s.Starter).OfType<LineupPlayer>()
                .Concat(t.Bench).Concat(t.Reserve).Concat(t.Taxi))
            .ToList();

        return new
        {
            League = league.League.Name,
            Starters = starters.Count,
            StartersMatched = starters.Count(p => p.Props is not null),
            Rostered = rostered.Count,
            RosteredMatched = rostered.Count(p => p.Props is not null),
            Unmatched = rostered
                .Where(p => p.Props is null)
                .Select(p => new { p.Name, p.Position, p.Team, Reason = p.Unmatched })
                .OrderBy(p => p.Name)
                .ToList(),
        };
    }

    /// <summary>
    /// Indexes the cached odds once per request and returns a lookup from a Sleeper id to props.
    /// The props side is the smaller set, so it is the one indexed.
    /// </summary>
    private async Task<Func<string, LineupPlayer>> CreateResolverAsync(PropSnapshot snapshot, CancellationToken ct)
    {
        var players = await _directory.GetAsync(ct);

        var index = _matcher.Index(snapshot.Players.Select(player => new PlayerIdentity(
            player.PlayerId,
            player.Name,
            NflTeamCodes.FromOddsSlug(player.Team),
            player.Position)));

        var propsById = snapshot.Players.ToDictionary(player => player.PlayerId, StringComparer.OrdinalIgnoreCase);

        return sleeperId =>
        {
            if (!players.TryGetValue(sleeperId, out var player))
            {
                return new LineupPlayer(sleeperId, sleeperId, null, null, null, null, UnmatchedReasons.NotInDirectory);
            }

            var name = player.FullName ?? sleeperId;
            var match = index.Find(new PlayerIdentity(sleeperId, name, player.Team, player.Position)
            {
                Active = player.Active,
            });

            var props = match is not null && propsById.TryGetValue(match.Target.SourceId, out var found)
                ? found
                : null;

            return new LineupPlayer(
                sleeperId,
                name,
                player.Position,
                player.Team,
                player.InjuryStatus,
                props,
                props is null ? UnmatchedReasons.NoProps : null);
        };
    }

    private LineupTeam BuildTeam(
        SleeperLeagueSnapshot league,
        SleeperRoster roster,
        IReadOnlyList<string> startingSlots,
        Func<string, LineupPlayer> resolve)
    {
        var starterIds = roster.Starters ?? [];

        if (starterIds.Count != startingSlots.Count)
        {
            // Sleeper keeps these aligned; a mismatch means the league is shaped unusually and the
            // pairing below would silently shift everyone by a slot.
            _logger.LogWarning(
                "Roster {Roster} has {Starters} starters for {Slots} slots.",
                roster.RosterId, starterIds.Count, startingSlots.Count);
        }

        var slots = new List<LineupSlot>();
        var startersOnRoster = new HashSet<string>(StringComparer.Ordinal);

        for (var index = 0; index < Math.Min(starterIds.Count, startingSlots.Count); index++)
        {
            var slot = startingSlots[index];
            var playerId = starterIds[index];

            // Sleeper writes an unfilled slot as "0".
            var starter = string.IsNullOrEmpty(playerId) || playerId == "0" ? null : resolve(playerId);
            if (starter is not null) startersOnRoster.Add(playerId);

            slots.Add(new LineupSlot(index, slot, RosterSlots.DisplayName(slot), starter, []));
        }

        var reserveIds = new HashSet<string>(roster.Reserve ?? [], StringComparer.Ordinal);
        var taxiIds = new HashSet<string>(roster.Taxi ?? [], StringComparer.Ordinal);

        var bench = (roster.Players ?? [])
            .Where(id => !startersOnRoster.Contains(id) && !taxiIds.Contains(id))
            .Select(resolve)
            .ToList();

        // Candidates are attached after the bench exists, since every slot draws from it.
        var withCandidates = slots
            .Select(slot => slot with
            {
                Candidates = bench.Where(player => RosterSlots.Accepts(slot.Slot, player.Position)).ToList(),
            })
            .ToList();

        return new LineupTeam(
            roster.RosterId,
            TeamNameFor(league, roster),
            ManagerFor(league, roster),
            withCandidates,
            bench.Where(player => !reserveIds.Contains(player.SleeperId)).ToList(),
            bench.Where(player => reserveIds.Contains(player.SleeperId)).ToList(),
            (roster.Taxi ?? []).Select(resolve).ToList());
    }

    private static SleeperUser? OwnerOf(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        league.Users.FirstOrDefault(user => user.UserId == roster.OwnerId);

    private static string TeamNameFor(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        OwnerOf(league, roster)?.TeamName ?? $"Roster {roster.RosterId}";

    private static string ManagerFor(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        OwnerOf(league, roster)?.DisplayName ?? "Unclaimed";
}
