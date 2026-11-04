"use client";

import dynamic from "next/dynamic";

const CostumeGallery = dynamic(() => import("@/components/CostumeGallery"), { ssr: false });

export default function CostumesPage() {
  return <CostumeGallery />;
}
