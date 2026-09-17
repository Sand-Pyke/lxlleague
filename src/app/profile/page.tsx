"use client";

import { Spin } from "antd";
import { Suspense } from "react";
import { ProfileView } from "@/components/profile/profile-view";

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="loading-state">
          <Spin size="large" />
        </div>
      }
    >
      <ProfileView />
    </Suspense>
  );
}
