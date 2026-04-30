"use client";

import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FilterOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input, Modal, Select, Spin, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { useFolderListSearch } from "@/components/photographer/photographer-shell";
import type { ApiClient } from "@/lib/clients-api";
import { ApiError, listClients } from "@/lib/clients-api";
import {
  FoldersApiError,
  getFolderClientName,
  listFolders,
  type ApiFolder,
} from "@/lib/folders-api";
import {
  getSmsMeta,
  listSmsMessages,
  sendSms,
  type SmsMeta,
  SmsApiError,
} from "@/lib/sms-api";

type OutgoingLogRow = {
  id: string;
  recipientName: string;
  phone: string;
  audienceTag: string;
  preview: string;
  body: string;
  charCount: number;
  sentAt: string;
  status: string;
  costLabel: string;
  errorMessage?: string;
};

/** Composer “single block” size for counts and UI (not carrier segment billing). */
const SMS_COMPOSER_CHAR_UNIT = 300;

function smsSegments(charCount: number): number {
  if (charCount <= 0) return 0;
  return Math.ceil(charCount / SMS_COMPOSER_CHAR_UNIT);
}

function formatSentAtDisplay(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return `${date}, ${time}`;
  } catch {
    return iso;
  }
}

function audienceLabel(kind: string): string {
  if (kind === "broadcast") return "broadcast";
  if (kind === "contact") return "contact";
  return kind || "individual";
}

function mapApiRow(m: {
  _id: string;
  recipientName: string;
  recipientPhone: string;
  recipientKind: string;
  message: string;
  messageLength: number;
  status: string;
  costGHS: number;
  errorMessage?: string;
  createdAt: string;
}): OutgoingLogRow {
  const body = m.message ?? "";
  const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
  return {
    id: m._id,
    recipientName: m.recipientName,
    phone: m.recipientPhone || "—",
    audienceTag: m.recipientKind,
    preview,
    body,
    charCount: m.messageLength ?? body.length,
    sentAt: m.createdAt,
    status: m.status,
    costLabel: `GH₵${Number(m.costGHS ?? 0).toFixed(2)}`,
    errorMessage: m.errorMessage,
  };
}

export default function SmsPage() {
  const { showToast } = useToast();
  const { query: shellQuery } = useFolderListSearch();
  const broadcastRef = useRef<HTMLTextAreaElement | null>(null);

  const [meta, setMeta] = useState<SmsMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);

  const [messageRows, setMessageRows] = useState<OutgoingLogRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);

  const [tableSearch, setTableSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed" | "skipped">(
    "all",
  );

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<string>("all_clients");
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [clients, setClients] = useState<ApiClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [folders, setFolders] = useState<ApiFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch((tableSearch.trim() || shellQuery.trim()).trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [tableSearch, shellQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadMeta = useCallback(async () => {
    setMetaLoading(true);
    try {
      const m = await getSmsMeta();
      setMeta(m);
      setRecipientType((prev) => {
        const ids = new Set(m.recipientTypes.map((r) => r.id));
        if (ids.has(prev)) return prev;
        return m.recipientTypes[0]?.id ?? "all_clients";
      });
    } catch (e) {
      const msg = e instanceof SmsApiError ? e.message : "Could not load SMS settings.";
      showToast(msg, "error");
      setMeta(null);
    } finally {
      setMetaLoading(false);
    }
  }, [showToast]);

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const statusParam =
        statusFilter === "all" ? ("" as const) : (statusFilter as "sent" | "failed" | "skipped");
      const res = await listSmsMessages({
        page,
        limit,
        search: debouncedSearch,
        status: statusParam,
      });
      setMessageRows(res.messages.map(mapApiRow));
      setTotal(res.pagination.total);
    } catch (e) {
      const msg = e instanceof SmsApiError ? e.message : "Could not load messages.";
      showToast(msg, "error");
      setMessageRows([]);
      setTotal(0);
    } finally {
      setMessagesLoading(false);
    }
  }, [page, limit, debouncedSearch, statusFilter, showToast]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!sendModalOpen) return;
    let cancelled = false;
    setClientsLoading(true);
    void (async () => {
      try {
        const cRes = await listClients("");
        if (!cancelled) setClients(cRes.clients);
      } catch (e) {
        const msg =
          e instanceof ApiError || e instanceof SmsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load clients.";
        showToast(msg, "error");
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendModalOpen, showToast]);

  useEffect(() => {
    if (!sendModalOpen) return;
    let cancelled = false;
    setFoldersLoading(true);
    void (async () => {
      try {
        const fList = await listFolders(
          selectedClientId ? { clientId: selectedClientId } : {},
        );
        if (!cancelled) setFolders(fList);
      } catch (e) {
        const msg =
          e instanceof FoldersApiError || e instanceof SmsApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Could not load folders.";
        showToast(msg, "error");
        if (!cancelled) setFolders([]);
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendModalOpen, selectedClientId, showToast]);

  const broadcastLen = broadcastMessage.length;
  const broadcastSegments = smsSegments(broadcastLen);
  const segmentBudget = Math.max(
    SMS_COMPOSER_CHAR_UNIT,
    broadcastSegments * SMS_COMPOSER_CHAR_UNIT,
  );

  const recipientOptions = useMemo(() => {
    if (meta?.recipientTypes?.length) return meta.recipientTypes;
    return [
      { id: "all_clients", label: "All clients" },
      { id: "client", label: "Single client" },
    ];
  }, [meta]);

  const placeholders = meta?.placeholders ?? [];

  const insertToken = useCallback((token: string) => {
    const ta = broadcastRef.current;
    if (!ta) {
      setBroadcastMessage((prev) => prev + token);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setBroadcastMessage((prev) => {
      const next = prev.slice(0, start) + token + prev.slice(end);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + token.length;
        ta.setSelectionRange(pos, pos);
      });
      return next;
    });
  }, []);

  const resetComposeForm = useCallback(() => {
    setRecipientType(meta?.recipientTypes[0]?.id ?? "all_clients");
    setSelectedClientId(undefined);
    setSelectedFolderId("");
    setBroadcastMessage("");
  }, [meta]);

  const closeSendModal = useCallback(() => {
    setSendModalOpen(false);
    resetComposeForm();
  }, [resetComposeForm]);

  const openSendModal = useCallback(() => {
    resetComposeForm();
    setSendModalOpen(true);
  }, [resetComposeForm]);

  const sendBroadcastSms = useCallback(async () => {
    const text = broadcastMessage.trim();
    if (!text) {
      showToast("Enter a message.", "error");
      return;
    }

    if (recipientType === "client" && !selectedClientId) {
      showToast("Select a client.", "error");
      return;
    }

    setSending(true);
    try {
      const res = await sendSms({
        recipientType,
        message: text,
        folderId: selectedFolderId || undefined,
        clientId: recipientType === "client" ? selectedClientId : undefined,
      });
      showToast(res.message, "success");
      closeSendModal();
      await loadMeta();
      await loadMessages();
    } catch (e) {
      const msg = e instanceof SmsApiError ? e.message : "Send failed.";
      showToast(msg, "error");
    } finally {
      setSending(false);
    }
  }, [
    broadcastMessage,
    recipientType,
    selectedClientId,
    selectedFolderId,
    showToast,
    closeSendModal,
    loadMeta,
    loadMessages,
  ]);

  const handleRefresh = useCallback(() => {
    void loadMeta();
    void loadMessages();
  }, [loadMeta, loadMessages]);

  const statusTag = useCallback((status: string, err?: string) => {
    if (status === "sent") {
      const tag = (
        <Tag icon={<CheckCircleOutlined />} color="success">
          Sent
        </Tag>
      );
      return err ? <Tooltip title={err}>{tag}</Tooltip> : tag;
    }
    if (status === "failed") {
      const tag = (
        <Tag icon={<CloseCircleOutlined />} color="error">
          Failed
        </Tag>
      );
      return err ? <Tooltip title={err}>{tag}</Tooltip> : tag;
    }
    if (status === "skipped") {
      const tag = (
        <Tag icon={<MinusCircleOutlined />} color="default">
          Skipped
        </Tag>
      );
      return err ? <Tooltip title={err}>{tag}</Tooltip> : tag;
    }
    return (
      <Tag icon={<ClockCircleOutlined />} color="processing">
        {status}
      </Tag>
    );
  }, []);

  const columns: ColumnsType<OutgoingLogRow> = useMemo(
    () => [
      {
        title: "Recipient",
        key: "recipient",
        width: 220,
        render: (_, row) => (
          <div className="space-y-1">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{row.recipientName}</p>
            <p className="font-mono text-xs text-zinc-500">{row.phone}</p>
            <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {audienceLabel(row.audienceTag)}
            </span>
          </div>
        ),
      },
      {
        title: "Message",
        key: "message",
        ellipsis: true,
        render: (_, row) => (
          <div>
            <p className="text-zinc-800 dark:text-zinc-200">{row.preview}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {row.charCount} character{row.charCount === 1 ? "" : "s"}
            </p>
          </div>
        ),
      },
      {
        title: "Sent at",
        dataIndex: "sentAt",
        key: "sentAt",
        width: 200,
        render: (iso: string) => (
          <span className="whitespace-nowrap text-sm text-zinc-600 dark:text-zinc-300">
            {formatSentAtDisplay(iso)}
          </span>
        ),
      },
      {
        title: "Status",
        key: "status",
        width: 120,
        render: (_, row) => statusTag(row.status, row.errorMessage),
      },
      {
        title: "Cost",
        dataIndex: "costLabel",
        key: "cost",
        width: 100,
        render: (v: string) => (
          <span className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{v}</span>
        ),
      },
    ],
    [statusTag],
  );

  const folderSelectOptions = useMemo(
    () =>
      folders.map((f) => ({
        value: f._id,
        label: `${f.eventName || "Gallery"} · ${getFolderClientName(f)}`,
      })),
    [folders],
  );

  const clientSelectOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c._id,
        label: `${c.name} · ${c.contact || c.email || "—"}`,
      })),
    [clients],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            SMS
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            SMS to clients — delivery status and costs from your provider.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#2563EB]/25 transition hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/40"
          onClick={openSendModal}
        >
          <SendOutlined className="text-base" aria-hidden />
          Send SMS
        </button>
      </div>

      {meta && !meta.configured ? (
        <Alert
          type="warning"
          showIcon
          message="SMS provider not configured"
          description="Set ARKESEL_API_KEY and ARKESEL_SENDER_ID on the server. Messages may fail until configuration is complete."
        />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 border-b border-zinc-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Recent Messages
          </h2>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:max-w-none sm:gap-3">
            <Input
              allowClear
              placeholder="Search messages…"
              prefix={<SearchOutlined className="text-zinc-400" />}
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="max-w-[min(100%,240px)]"
            />
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={messagesLoading}>
              Refresh
            </Button>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              className="min-w-[130px]"
              suffixIcon={<FilterOutlined className="text-zinc-400" />}
              options={[
                { value: "all", label: "All statuses" },
                { value: "sent", label: "Sent" },
                { value: "failed", label: "Failed" },
                { value: "skipped", label: "Skipped" },
              ]}
            />
          </div>
        </div>

        <div className="overflow-x-auto [&_.ant-table]:bg-transparent [&_.ant-table-thead>tr>th]:dark:bg-zinc-900/80 [&_.ant-table-thead>tr>th]:dark:text-zinc-300 [&_.ant-table-tbody>tr>td]:dark:border-zinc-800 [&_.ant-table-thead>tr>th]:dark:border-zinc-800">
          <Spin spinning={messagesLoading && messageRows.length === 0}>
            <Table<OutgoingLogRow>
              rowKey="id"
              columns={columns}
              dataSource={messageRows}
              pagination={{
                current: page,
                pageSize: limit,
                total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (t) => (
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Total {t} message{t === 1 ? "" : "s"}
                  </span>
                ),
                onChange: (p, ps) => {
                  setPage(p);
                  setLimit(ps);
                },
              }}
              locale={{ emptyText: "No messages match your filters." }}
              scroll={{ x: "max-content" }}
            />
          </Spin>
        </div>
      </section>

      <Modal
        title={
          <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Send SMS</span>
        }
        open={sendModalOpen}
        onCancel={closeSendModal}
        footer={null}
        width={720}
        destroyOnHidden
        styles={{ body: { paddingTop: 8 } }}
      >
        <Spin spinning={metaLoading}>
          <div className="max-h-[min(75vh,640px)] overflow-y-auto pr-1">
            <div className="space-y-5 pt-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <span className="text-red-500">*</span> Recipient type
                </label>
                <div className="relative">
                  <select
                    value={recipientType}
                    onChange={(e) => {
                      setRecipientType(e.target.value);
                      setSelectedClientId(undefined);
                    }}
                    className="w-full appearance-none rounded-lg border border-zinc-200 bg-white py-2.5 pl-3 pr-10 text-sm outline-none ring-brand/25 focus:border-brand focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {recipientOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                    ▾
                  </span>
                </div>
              </div>

              {recipientType === "client" ? (
                <div className="grid gap-2">
                  <label
                    htmlFor="sms-client-select"
                    className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
                  >
                    <span className="text-red-500">*</span> Client
                  </label>
                  <Select
                    id="sms-client-select"
                    showSearch
                    allowClear
                    placeholder="Search and select a client…"
                    optionFilterProp="label"
                    className="w-full"
                    loading={clientsLoading}
                    value={selectedClientId}
                    onChange={(id) => setSelectedClientId(id)}
                    options={clientSelectOptions}
                  />
                </div>
              ) : null}

              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Folder (optional)
                </label>
                <p className="text-xs text-zinc-500">
                  Link placeholders like gallery links to a specific folder when needed.
                </p>
                <Select
                  allowClear
                  showSearch
                  placeholder="No folder"
                  optionFilterProp="label"
                  className="w-full"
                  loading={foldersLoading}
                  value={selectedFolderId || undefined}
                  onChange={(id) => setSelectedFolderId(id ?? "")}
                  options={folderSelectOptions}
                />
              </div>

              <div className="grid gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Insert placeholders
                </span>
                <div className="flex flex-wrap gap-2">
                  {placeholders.length ? (
                    placeholders.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => insertToken(p.token)}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-brand/5 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        {p.label}
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500">Loading placeholders…</span>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <span className="text-red-500">*</span> Message
                </label>
                <div className="relative">
                  <textarea
                    ref={broadcastRef}
                    rows={5}
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    placeholder="Enter your SMS message…"
                    className="min-h-[120px] w-full resize-y rounded-lg border border-zinc-200 bg-white py-3 px-3 pb-9 text-sm outline-none focus:border-brand focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <div className="pointer-events-none absolute bottom-3 right-3 text-xs tabular-nums text-zinc-500">
                  {broadcastLen <= SMS_COMPOSER_CHAR_UNIT ? (
                    <span>
                      {broadcastLen} / {SMS_COMPOSER_CHAR_UNIT}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">
                      {broadcastLen} / {segmentBudget}
                      <span className="ml-1 text-zinc-500">({broadcastSegments} SMS)</span>
                    </span>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Spin>

        <hr className="my-6 border-zinc-200 dark:border-zinc-700" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button size="large" onClick={closeSendModal} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={() => void sendBroadcastSms()}
            loading={sending}
            disabled={!broadcastMessage.trim() || metaLoading}
            className="!bg-[#2563EB] hover:!bg-[#1d4ed8]"
          >
            Send SMS
          </Button>
        </div>
      </Modal>
    </div>
  );
}
