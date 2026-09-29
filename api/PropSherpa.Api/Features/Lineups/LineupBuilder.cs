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

    public LineupBuilder(
        PropCache props,
        SleeperLeagueCache leagues,
        SleeperPlayerDirectory directory,
        IPlayerMatcher matcher)
    {
        _props = props;
        _leagues = leagues;
        _directory = directory;
        _matcher = matcher;
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
        var resolver = await CreateResolverAsync(snapshot, league, ct);

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
        var resolver = await CreateResolverAsync(snapshot, league, ct);
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
    private async Task<Func<string, LineupPlayer>> CreateResolverAsync(
        PropSnapshot snapshot,
        SleeperLeagueSnapshot league,
        CancellationToken ct)
    {
        var players = await _directory.GetAsync(ct);
        var pointsPerReception = LeagueScoring.From(league.League.ScoringSettings).Rec;

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
                props is null ? UnmatchedReasons.NoProps : null)
            {
                SleeperPoints = league.Projections.GetValueOrDefault(sleeperId)?.For(pointsPerReception),
            };
        };
    }

    private static LineupTeam BuildTeam(
        SleeperLeagueSnapshot league,
        SleeperRoster roster,
        IReadOnlyList<string> startingSlots,
        Func<string, LineupPlayer> resolve)
    {
        var reserveIds = new HashSet<string>(roster.Reserve ?? [], StringComparer.Ordinal);
        var taxiIds = new HashSet<string>(roster.Taxi ?? [], StringComparer.Ordinal);
        var scoring = LeagueScoring.From(league.League.ScoringSettings);

        // Every rostered player competes for a slot, not just the ones currently benched: the page
        // shows the best lineup available rather than the one that happens to be set.
        var available = (roster.Players ?? [])
            .Where(id => !taxiIds.Contains(id) && !reserveIds.Contains(id))
            .Select(resolve)
            .ToList();

        var (slots, benched) = MarkUpgrades(
            BuildOptimalSlots(startingSlots, available, scoring),
            roster.Starters ?? [],
            available,
            scoring);

        var startingIds = slots
            .Select(slot => slot.Starter?.SleeperId)
            .Where(id => id is not null)
            .ToHashSet(StringComparer.Ordinal)!;

        // The bench is ordered by projection so the reader's eye lands on the best available player
        // rather than on Sleeper's roster order, which carries no meaning here.
        var bench = available
            .Where(player => !startingIds.Contains(player.SleeperId))
            .Select(player => (benched.GetValueOrDefault(player.SleeperId) ?? player) with
            {
                EligibleSlots = slots
                    .Where(slot => RosterSlots.Accepts(slot.Slot, player.Position))
                    .Select(slot => slot.Index)
                    .ToList(),
            })
            .OrderByDescending(player => LineupScorer.Points(player.Props, scoring) ?? double.MinValue)
            .ToList();

        return new LineupTeam(
            roster.RosterId,
            TeamNameFor(league, roster),
            ManagerFor(league, roster),
            slots,
            bench,
            (roster.Reserve ?? []).Select(resolve).ToList(),
            (roster.Taxi ?? []).Select(resolve).ToList());
    }

    /// <summary>
    /// Fills every slot with the best player it can legally take.
    ///
    /// Slots are filled from most restrictive to least - a TE slot before a FLEX - because the
    /// reverse lets a FLEX take the only eligible tight end and leave the TE slot empty. Within
    /// that, the highest projection wins, and each player can only fill one slot.
    /// </summary>
    private static List<LineupSlot> BuildOptimalSlots(
        IReadOnlyList<string> startingSlots,
        IReadOnlyList<LineupPlayer> available,
        LeagueScoring scoring)
    {
        var points = available.ToDictionary(
            player => player.SleeperId,
            player => LineupScorer.Points(player.Props, scoring),
            StringComparer.Ordinal);

        var eligible = startingSlots
            .Select((slot, index) => (
                Index: index,
                Slot: slot,
                Players: available.Where(p => RosterSlots.Accepts(slot, p.Position)).ToList()))
            .ToList();

        var taken = new HashSet<string>(StringComparer.Ordinal);
        var filled = new Dictionary<int, LineupPlayer?>();

        foreach (var entry in eligible.OrderBy(e => e.Players.Count).ThenBy(e => e.Index))
        {
            var best = entry.Players
                .Where(p => !taken.Contains(p.SleeperId))
                // An unpriced player can still hold a slot, but never ahead of a priced one.
                .OrderByDescending(p => points.GetValueOrDefault(p.SleeperId) ?? double.MinValue)
                .FirstOrDefault();

            if (best is not null) taken.Add(best.SleeperId);
            filled[entry.Index] = best;
        }

        return eligible
            .OrderBy(entry => entry.Index)
            .Select(entry => new LineupSlot(
                entry.Index,
                entry.Slot,
                RosterSlots.DisplayName(entry.Slot),
                filled.GetValueOrDefault(entry.Index),
                // Everyone else this slot could take, for the drawer to compare against.
                entry.Players
                    .Where(p => p.SleeperId != filled.GetValueOrDefault(entry.Index)?.SleeperId)
                    .OrderByDescending(p => points.GetValueOrDefault(p.SleeperId) ?? double.MinValue)
                    .ToList()))
            .ToList();
    }

    /// <summary>
    /// Flags the slots whose player is not in the lineup the manager set, and pairs each one with
    /// the player they displace.
    ///
    /// Membership of the lineup is what counts, not the slot someone occupies: a player who keeps
    /// starting but moves from FLEX to WR has not been changed. Pairing is by projection, best
    /// addition against best removal, which is the comparison worth showing even though the
    /// optimizer never made a one-for-one decision.
    ///
    /// Returns the flagged slots along with the dropped players, keyed by id, each carrying the
    /// player who took their place - the same pairing read from the other end.
    /// </summary>
    private static (List<LineupSlot> Slots, Dictionary<string, LineupPlayer> Benched) MarkUpgrades(
        List<LineupSlot> slots,
        IReadOnlyList<string> actualStarters,
        IReadOnlyList<LineupPlayer> available,
        LeagueScoring scoring)
    {
        var wereStarting = actualStarters
            .Where(id => !string.IsNullOrEmpty(id) && id != "0")
            .ToHashSet(StringComparer.Ordinal);

        // Nothing to compare against - a roster with no lineup set yet.
        if (wereStarting.Count == 0) return (slots, []);

        var points = available.ToDictionary(
            player => player.SleeperId,
            player => LineupScorer.Points(player.Props, scoring) ?? 0,
            StringComparer.Ordinal);

        var added = slots
            .Where(slot => slot.Starter is not null && !wereStarting.Contains(slot.Starter.SleeperId))
            .OrderByDescending(slot => points.GetValueOrDefault(slot.Starter!.SleeperId))
            .ToList();

        var nowStarting = slots
            .Select(slot => slot.Starter?.SleeperId)
            .Where(id => id is not null)
            .ToHashSet(StringComparer.Ordinal);

        var dropped = available
            .Where(player => wereStarting.Contains(player.SleeperId) && !nowStarting.Contains(player.SleeperId))
            .OrderByDescending(player => points.GetValueOrDefault(player.SleeperId))
            .ToList();

        var upgrades = PairUpgrades(added, dropped, points);

        var flagged = slots
            .Select(slot => upgrades.TryGetValue(slot.Index, out var replaces)
                ? slot with { Upgraded = true, Replaces = replaces }
                : slot)
            .ToList();

        // The same pairs read backwards, so the bench row names whoever took the spot.
        var replacedBy = upgrades
            .Where(pair => pair.Value is not null)
            .ToDictionary(
                pair => pair.Value!.SleeperId,
                pair => flagged.First(slot => slot.Index == pair.Key).Starter,
                StringComparer.Ordinal);

        var benched = dropped.ToDictionary(
            player => player.SleeperId,
            player => player with
            {
                Benched = true,
                ReplacedBy = replacedBy.GetValueOrDefault(player.SleeperId),
            },
            StringComparer.Ordinal);

        return (flagged, benched);
    }

    /// <summary>
    /// Matches each added player to the one they displace, best against best within a group.
    ///
    /// Quarterbacks pair only with quarterbacks. The optimizer never made a one-for-one decision -
    /// this is presentation - so an unconstrained pairing is free to claim a receiver "replaces" a
    /// quarterback, which is true of the lineup as a whole but reads as nonsense on the row. Every
    /// other position is interchangeable enough that a flex-eligible pairing tells the reader
    /// something real.
    ///
    /// An addition with no counterpart in its own group is left unpaired: the change still stands
    /// and the row still shows as an upgrade, just without a name to put against it.
    /// </summary>
    private static Dictionary<int, LineupPlayer?> PairUpgrades(
        IReadOnlyList<LineupSlot> added,
        IReadOnlyList<LineupPlayer> dropped,
        IReadOnlyDictionary<string, double> points)
    {
        static bool IsQuarterback(LineupPlayer? player) =>
            string.Equals(player?.Position, "QB", StringComparison.OrdinalIgnoreCase);

        var pairs = new Dictionary<int, LineupPlayer?>();

        foreach (var group in added.GroupBy(slot => IsQuarterback(slot.Starter)))
        {
            var counterparts = dropped
                .Where(player => IsQuarterback(player) == group.Key)
                .OrderByDescending(player => points.GetValueOrDefault(player.SleeperId))
                .ToList();

            foreach (var (slot, rank) in group.Select((slot, rank) => (slot, rank)))
            {
                pairs[slot.Index] = rank < counterparts.Count ? counterparts[rank] : null;
            }
        }

        return pairs;
    }

    private static SleeperUser? OwnerOf(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        league.Users.FirstOrDefault(user => user.UserId == roster.OwnerId);

    private static string TeamNameFor(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        OwnerOf(league, roster)?.TeamName ?? $"Roster {roster.RosterId}";

    private static string ManagerFor(SleeperLeagueSnapshot league, SleeperRoster roster) =>
        OwnerOf(league, roster)?.DisplayName ?? "Unclaimed";
}
