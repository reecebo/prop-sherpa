import { useState } from 'react';

interface Props {
  sleeperId: string;
  name: string;
  position: string | null;
}

/**
 * A player's headshot, from Sleeper's CDN.
 *
 * The URL is derivable from the player id, so nothing extra has to be fetched or stored. Players
 * without a photo return a 403 rather than a placeholder, so a failed load falls back to initials
 * tinted by position - which is also what renders before the image arrives.
 */
export function PlayerAvatar({ sleeperId, name, position }: Readonly<Props>) {
  const [failed, setFailed] = useState(false);

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  if (failed) {
    return (
      <span className="avatar avatar-fallback" data-pos={position ?? undefined} aria-hidden="true">
        {initials}
      </span>
    );
  }

  return (
    <img
      className="avatar"
      src={`https://sleepercdn.com/content/nfl/players/${sleeperId}.jpg`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
