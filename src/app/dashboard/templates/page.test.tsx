// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TemplatesPage from "./page";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "测试用户" } } }),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/templates",
}));

vi.mock("@/components/layout/Navbar", () => ({
  Navbar: () => <div />,
}));

vi.mock("@/components/ui/use-toast", () => {
  const addToast = vi.fn();
  return { useToast: () => ({ addToast }) };
});

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const okJson = (data: unknown) =>
  ({ ok: true, json: async () => data }) as unknown as Response;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("templates/page.tsx 数据加载失败态", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // 组件会把错误打到控制台，测试中静默掉避免噪音
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(<TemplatesPage />);
      await flush();
    });
  };

  const clickRetry = async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "重试",
    );
    expect(button).toBeDefined();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    });
  };

  it("加载失败时展示错误条与「重试」，不渲染空态", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await renderPage();

    expect(container.textContent).toContain("加载话术模板失败");
    expect(container.textContent).toContain("重试");
    expect(container.textContent).not.toContain("暂无话术模板");
  });

  it("点击「重试」重新拉取，成功后渲染空态", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await renderPage();

    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/templates")) return okJson({ templates: [] });
      throw new Error(`unexpected url: ${url}`);
    });
    await clickRetry();

    expect(container.textContent).not.toContain("加载话术模板失败");
    expect(container.textContent).toContain("暂无话术模板");
  });
});
