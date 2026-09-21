import { CommunityCard } from "@/components/profile/community-card";
import { LeagueShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function CommunityPage() {
  return (
    <LeagueShell>
      <div className="community-page">
        <CommunityCard />
      </div>
    </LeagueShell>
  );
}
