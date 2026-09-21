import { LeagueShell } from "@/components/app-shell";
import { VideoGallery } from "@/components/video-gallery";

export const dynamic = "force-dynamic";

export default function VideosPage() {
  return (
    <LeagueShell>
      <div className="videos-page">
        <VideoGallery />
      </div>
    </LeagueShell>
  );
}
