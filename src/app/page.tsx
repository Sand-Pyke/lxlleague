import { HomeDashboard } from "@/components/home-dashboard";
import { getMatches, getPlayers } from "@/lib/repository";
import { getViewer } from "@/server/auth";

export default async function Home() {
  const viewer = await getViewer();
  const [matches, players] = await Promise.all([getMatches(viewer?.id), getPlayers()]);

  return <HomeDashboard matches={matches} players={players} />;
}
