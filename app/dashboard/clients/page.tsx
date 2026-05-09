"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Skeleton, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateClientModal } from "@/components/photographer/create-client-modal";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import { useToast } from "@/components/toast-provider";
import { deleteClient, listClients, type ApiClient } from "@/lib/clients-api";

export default function ClientsPage() {
  const { query } = useFolderListSearch();
  const { showToast } = useToast();

  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiClient | null>(null);

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchClients = useCallback(
    async (search: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const { clients } = await listClients(search);
        if (signal?.aborted) return;
        setClients(clients);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load clients.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [],
  );

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
    setPage((p) => Math.min(p, maxPage));
  }, [clients.length, pageSize]);

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
      if (exists) {
        return prev.map((c) => (c._id === saved._id ? saved : c));
      }
      return [saved, ...prev];
    });
  }

  const handleDelete = useCallback(
    async (client: ApiClient) => {
      if (pendingDeleteId) return;
      const confirmed = window.confirm(
        `Delete "${client.name}"? This cannot be undone.`,
      );
      if (!confirmed) return;

      setPendingDeleteId(client._id);
      try {
        await deleteClient(client._id);
        setClients((prev) => prev.filter((c) => c._id !== client._id));
        showToast("Client deleted.", "success");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete client.";
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
        render: (name: string) => <span className="font-medium text-zinc-900 dark:text-zinc-50">{name}</span>,
      },
      {
        title: "Email",
        dataIndex: "email",
        key: "email",
        render: (v: string | undefined) => (
          <span className="text-zinc-600 dark:text-zinc-300">{v || "—"}</span>
        ),
      },
      {
        title: "Number",
        dataIndex: "contact",
        key: "contact",
        render: (v: string | undefined) => (
          <span className="text-zinc-600 dark:text-zinc-300">{v || "—"}</span>
        ),
      },
      {
        title: "Location",
        dataIndex: "location",
        key: "location",
        render: (v: string | undefined) => (
          <span className="text-zinc-600 dark:text-zinc-300">{v || "Unknown"}</span>
        ),
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
    [openEdit, handleDelete, pendingDeleteId],
  );

  const emptyText = query.trim()
    ? "No clients match your search."
    : "No clients yet.";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Clients
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Register clients (name, contact, location).
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openCreate}>
          Add new client
        </Button>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load clients"
          description={error}
          action={
            <Button size="small" onClick={() => fetchClients(query.trim())}>
              Retry
            </Button>
          }
        />
      ) : null}

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
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
              hideOnSinglePage: true,
            }}
            locale={{ emptyText }}
            rowClassName={(record) =>
              pendingDeleteId === record._id ? "opacity-60" : ""
            }
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
    </div>
  );
}
