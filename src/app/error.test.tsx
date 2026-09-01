// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ErrorPage from "./error";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("app/error.tsx 路由级错误边界", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // 组件会把错误打到控制台，测试中静默掉避免噪音
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("渲染错误描述与「重试」按钮", () => {
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    act(() => {
      root.render(<ErrorPage error={error} reset={() => {}} />);
    });

    expect(container.textContent).toContain("重试");
    // 有错误描述文案
    expect(container.querySelector("h2")?.textContent).toBeTruthy();
    expect(container.querySelector("button")).not.toBeNull();
  });

  it("点击「重试」按钮调用 reset", () => {
    const reset = vi.fn();
    act(() => {
      root.render(<ErrorPage error={new Error("boom")} reset={reset} />);
    });

    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("重试"),
    );
    expect(button).toBeDefined();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
