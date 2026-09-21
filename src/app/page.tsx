import { HomeDashboard } from "@/components/home-dashboard";
import { getMatches, getPlayers } from "@/lib/repository";
import { getViewer } from "@/server/auth";
import { homeRecentResults } from "@/server/home";

export default async function Home() {
  const viewer = await getViewer();
  const [matches, players, recent] = await Promise.all([
    getMatches(viewer?.id),
    getPlayers(),
    homeRecentResults(),
  ]);

  return <HomeDashboard matches={matches} players={players} recent={recent} />;
}
