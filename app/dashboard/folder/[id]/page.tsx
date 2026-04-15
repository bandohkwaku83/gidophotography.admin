"use client";

import { use } from "react";
import { FolderDetailView } from "@/components/photographer/folder-detail-view";

export default function FolderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <FolderDetailView key={id} folderId={id} />;
}
