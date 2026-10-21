"use client";

import Link from "next/link";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Skeleton, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { DashboardPage } from "@/components/photographer/dashboard-page";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { useToast } from "@/components/toast-provider";
import { deleteClient, listClients, type ApiClient } from "@/lib/clients-api";
import { getFolderClientId, listFolders } from "@/lib/folders-api";

export default function ClientsPage() {
  const { query, setQuery } = useFolderListSearch();
  const { showToast } = useToast();

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiClient | null>(null);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [galleryCounts, setGalleryCounts] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchClients = useCallback(async (search: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const { clients: next } = await listClients(search);
      if (signal?.aborted) return;
      setClients(next);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load clients.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(() => {
      fetchClients(query.trim(), controller.signal);
    }, 250);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, fetchClients]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(clients.length / pageSize) || 1);
    setPage((current) => Math.min(current, maxPage));
  }, [clients.length, pageSize]);

  useEffect(() => {
    let cancelled = false;
    listFolders()
      .then((folders) => {
        if (cancelled) return;
        const counts = new Map<string, number>();
        for (const folder of folders) {
          const id = getFolderClientId(folder);
          if (!id) continue;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        setGalleryCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setGalleryCounts(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setClientModalOpen(true);
  }, []);

  const openEdit = useCallback((client: ApiClient) => {
    setEditing(client);
    setClientModalOpen(true);
  }, []);

  function handleSaved(saved: ApiClient) {
    setClients((prev) => {
      const exists = prev.some((c) => c._id === saved._id);
      if (exists) return prev.map((c) => (c._id === saved._id ? saved : c));
      return [saved, ...prev];
    });
  }

  const handleDelete = useCallback(
    async (client: ApiClient) => {
      if (pendingDeleteId) return;
      const confirmed = window.confirm(`Delete "${client.name}"? This cannot be undone.`);
      if (!confirmed) return;

      setPendingDeleteId(client._id);
      try {
        await deleteClient(client._id);
        setClients((prev) => prev.filter((c) => c._id !== client._id));
        showToast("Client deleted.", "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to delete client.";
        showToast(message, "error");
      } finally {
        setPendingDeleteId(null);
      }
    },
    [pendingDeleteId, showToast],
  );

  const columns: ColumnsType<ApiClient> = useMemo(
    () => [
      {
        title: "Name",
        dataIndex: "name",
        key: "name",
        render: (name: string) => (
          <span className="font-medium text-zinc-900 dark:text-zinc-50">{name}</span>
        ),
      },
      {
        title: "Email",
        dataIndex: "email",
        key: "email",
        render: (value: string | undefined) =>
          value ? (
            <a href={`mailto:${value}`} className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300">
              {value}
            </a>
          ) : (
            <span className="text-zinc-400">—</span>
          ),
      },
      {
        title: "Number",
        dataIndex: "contact",
        key: "contact",
        render: (value: string | undefined) =>
          value ? (
            <a
              href={`tel:${value.replace(/\s+/g, "")}`}
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300"
            >
              {value}
            </a>
          ) : (
            <span className="text-zinc-400">—</span>
          ),
      },
      {
        title: "Location",
        dataIndex: "location",
        key: "location",
        render: (value: string | undefined) => (
          <span className="text-zinc-600 dark:text-zinc-300">{value || "Unknown"}</span>
        ),
      },
      {
        title: "Galleries",
        key: "galleries",
        width: 120,
        render: (_, record) => {
          if (galleryCounts == null) return <span className="text-zinc-400">…</span>;
          const count = galleryCounts.get(record._id) ?? 0;
          if (count === 0) return <span className="text-zinc-400">None</span>;
          return (
            <Link
              href={`/dashboard/galleries?client=${encodeURIComponent(record._id)}`}
              onClick={() => setQuery("")}
              className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
            >
              {count}
            </Link>
          );
        },
      },
      {
        title: "Actions",
        key: "actions",
        align: "right",
        width: 120,
        render: (_, record) => {
          const isDeleting = pendingDeleteId === record._id;
          return (
            <Space size="small">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => openEdit(record)}
                disabled={isDeleting}
                aria-label={`Edit ${record.name}`}
                title="Edit"
              />
              <Button
                type="text"
                size="small"
                danger
                icon={
                  isDeleting ? (
                    <Skeleton.Avatar active size={16} shape="square" className="!inline-flex" />
                  ) : (
                    <DeleteOutlined />
                  )
                }
                onClick={() => handleDelete(record)}
                disabled={isDeleting}
                aria-label={`Delete ${record.name}`}
                title="Delete"
              />
            </Space>
          );
        },
      },
    ],
    [galleryCounts, handleDelete, openEdit, pendingDeleteId, setQuery],
  );

  const trimmed = query.trim();
  const emptyText = trimmed ? "No clients match your search." : "No clients yet.";

  return (
    <DashboardPage className="space-y-5">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-studio-ink">Clients</h1>
          <p className="mt-0.5 max-w-xl text-sm text-studio-taupe">
            The people you photograph, ready for a gallery or a booking.
          </p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={openCreate}
          className="!bg-studio-ink hover:!bg-studio-charcoal"
        >
          New client
        </Button>
      </section>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load clients"
          description={error}
          action={
            <Button size="small" onClick={() => fetchClients(trimmed)}>
              Retry
            </Button>
          }
        />
      ) : null}

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-studio-taupe"
            aria-hidden
          />
          <input
            id="clients-page-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className="w-full rounded-lg border border-studio-line bg-white py-2 pr-10 pl-9 text-sm text-studio-ink shadow-[0_1px_2px_rgba(26,22,18,0.04)] outline-none transition placeholder:text-[#b3a89a] focus:border-studio-gold focus:ring-2 focus:ring-studio-gold/25"
            aria-label="Search clients"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-studio-taupe transition hover:bg-[#f5f5f5] hover:text-studio-ink"
              aria-label="Clear client search"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </section>

      {!error ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 [&_.ant-table]:bg-transparent [&_.ant-table-thead>tr>th]:dark:bg-zinc-900/80 [&_.ant-table-thead>tr>th]:dark:text-zinc-300 [&_.ant-table-tbody>tr>td]:dark:border-zinc-800 [&_.ant-table-thead>tr>th]:dark:border-zinc-800">
          <Table<ApiClient>
            rowKey="_id"
            columns={columns}
            dataSource={clients}
            loading={loading}
            pagination={{
              current: page,
              pageSize,
              total: clients.length,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (total, range) =>
                total === 0
                  ? "0 clients"
                  : `${range[0]}–${range[1]} of ${total} client${total === 1 ? "" : "s"}`,
              onChange: (nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              },
              hideOnSinglePage: true,
            }}
            locale={{ emptyText }}
            rowClassName={(record) => (pendingDeleteId === record._id ? "opacity-60" : "")}
            scroll={{ x: "max-content" }}
          />
        </div>
      ) : null}

      <CreateClientModal
        open={clientModalOpen}
        client={editing}
        onClose={() => {
          setClientModalOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </DashboardPage>
  );
}
