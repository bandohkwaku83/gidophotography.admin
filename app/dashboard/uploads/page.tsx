"use client";

import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { loadAllProjects } from "@/lib/demo-data";

type UploadRow = {
  id: string;
  clientName: string;
  rawCount: number;
  editedCount: number;
};

export default function UploadsPage() {
  const { query } = useFolderListSearch();

  const uploadRows = useMemo(() => {
    const all = loadAllProjects();
    const q = query.trim().toLowerCase();
    return all
      .filter((p) => !q || p.clientName.toLowerCase().includes(q))
      .map((p) => ({
        id: p.id,
        clientName: p.clientName,
        rawCount: p.assets.length,
        editedCount: p.finalAssets.length,
      }));
  }, [query]);

  const columns: ColumnsType<UploadRow> = useMemo(
    () => [
      {
        title: "Client",
        dataIndex: "clientName",
        key: "client",
        render: (v: string) => (
          <span className="text-zinc-900 dark:text-zinc-50">{v}</span>
        ),
      },
      {
        title: "Raw uploads",
        dataIndex: "rawCount",
        key: "raw",
        render: (n: number) => (
          <span className="text-zinc-600 dark:text-zinc-300">{n}</span>
        ),
      },
      {
        title: "Edited uploads",
        dataIndex: "editedCount",
        key: "edited",
        render: (n: number) => (
          <span className="text-zinc-600 dark:text-zinc-300">{n}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Uploads
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Monitor raw and edited file uploads across all galleries.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 [&_.ant-table]:bg-transparent [&_.ant-table-thead>tr>th]:dark:bg-zinc-900/80 [&_.ant-table-thead>tr>th]:dark:text-zinc-300 [&_.ant-table-tbody>tr>td]:dark:border-zinc-800 [&_.ant-table-thead>tr>th]:dark:border-zinc-800">
        <Table<UploadRow>
          rowKey="id"
          columns={columns}
          dataSource={uploadRows}
          pagination={false}
          locale={{ emptyText: "No galleries match your search." }}
        />
      </div>
    </div>
  );
}
