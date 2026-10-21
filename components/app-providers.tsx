"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";

/**
 * Ant Design for **dashboard routes only** (tables, forms, pickers, etc.).
 * Keeps AntD tokens and CSS off public pages so layout/colors stay unchanged there.
 */
export function DashboardAntdProviders({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#1a1612",
            colorPrimaryHover: "#2c2824",
            colorPrimaryActive: "#14110e",
            borderRadius: 10,
            fontFamily: "var(--font-sans), system-ui, sans-serif",
          },
          components: {
            Table: {
              headerBg: "rgb(250 250 250)",
              headerSplitColor: "transparent",
              rowHoverBg: "rgba(244, 244, 245, 0.8)",
              borderColor: "#e4e4e7",
              cellPaddingBlockMD: 12,
              cellPaddingInlineMD: 16,
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </AntdRegistry>
  );
}
