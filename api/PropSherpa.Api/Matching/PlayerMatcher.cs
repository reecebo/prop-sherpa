namespace PropSherpa.Api.Matching;

public interface IPlayerMatcher
{
    /// <summary>
    /// Indexes a set of players for repeated lookups. Building the index costs one pass; scanning
    /// per lookup would cost one pass per roster slot.
    /// </summary>
    IPlayerIndex Index(IEnumerable<PlayerIdentity> targets);
}

public interface IPlayerIndex
{
    /// <summary>The matching player, or null when there is no confident answer.</summary>
    PlayerMatch? Find(PlayerIdentity source);
}

public class PlayerMatcher : IPlayerMatcher
{
    public IPlayerIndex Index(IEnumerable<PlayerIdentity> targets) => new PlayerIndex(targets);

    private sealed class PlayerIndex : IPlayerIndex
    {
        private readonly Dictionary<string, List<PlayerIdentity>> _byNameKey = new(StringComparer.Ordinal);

        public PlayerIndex(IEnumerable<PlayerIdentity> targets)
        {
            foreach (var target in targets)
            {
                var key = PlayerNameKey.For(target.Name);
                if (key.Length == 0) continue;

                if (!_byNameKey.TryGetValue(key, out var bucket))
                {
                    _byNameKey[key] = bucket = [];
                }

                bucket.Add(target);
            }
        }

        public PlayerMatch? Find(PlayerIdentity source)
        {
            var key = PlayerAliases.Resolve(PlayerNameKey.For(source.Name));
            if (key.Length == 0 || !_byNameKey.TryGetValue(key, out var candidates)) return null;

            if (candidates.Count == 1) return Match(source, candidates[0]);

            // Rank rather than filter. A player traded mid-week has a stale team in one source, so
            // requiring the teams to agree would drop a match that is otherwise unambiguous.
            var ranked = candidates
                .Select(candidate => (candidate, score: Score(source, candidate)))
                .OrderByDescending(entry => entry.score)
                .ToList();

            // Two candidates the evidence cannot separate. An unmatched player is shown honestly;
            // a wrong one is not.
            if (ranked[0].score == ranked[1].score) return null;

            return Match(source, ranked[0].candidate);
        }

        private static int Score(PlayerIdentity source, PlayerIdentity candidate)
        {
            var score = 0;

            if (TeamsAgree(source, candidate)) score += 4;
            if (candidate.Active) score += 2;
            if (PositionsAgree(source, candidate)) score += 1;

            return score;
        }

        private static PlayerMatch Match(PlayerIdentity source, PlayerIdentity target) =>
            new(target, TeamsAgree(source, target) ? MatchConfidence.Exact : MatchConfidence.NameOnly);

        private static bool TeamsAgree(PlayerIdentity a, PlayerIdentity b) =>
            a.TeamCode is not null &&
            b.TeamCode is not null &&
            string.Equals(a.TeamCode, b.TeamCode, StringComparison.OrdinalIgnoreCase);

        private static bool PositionsAgree(PlayerIdentity a, PlayerIdentity b) =>
            a.Position is not null &&
            b.Position is not null &&
            string.Equals(a.Position, b.Position, StringComparison.OrdinalIgnoreCase);
    }
}
