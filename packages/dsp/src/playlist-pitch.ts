export interface PlaylistPitch {
  curator: string;
  platform: string;
  leadDays: number;
  contact?: string;
}

export const INDIE_CURATORS: PlaylistPitch[] = [
  { curator: "Alt Rock Daily", platform: "spotify", leadDays: 14 },
  { curator: "Indie Rock Road", platform: "spotify", leadDays: 14 },
  { curator: "New Rock Finds", platform: "spotify", leadDays: 7 },
];

export function buildPitchSchedule(releaseDate: Date): Array<{
  curator: string;
  sendDate: Date;
}> {
  return INDIE_CURATORS.map((c) => ({
    curator: c.curator,
    sendDate: new Date(
      releaseDate.getTime() - c.leadDays * 24 * 60 * 60 * 1000
    ),
  }));
}

export function spotifyEditorialDeadline(releaseDate: Date): Date {
  return new Date(releaseDate.getTime() - 7 * 24 * 60 * 60 * 1000);
}
