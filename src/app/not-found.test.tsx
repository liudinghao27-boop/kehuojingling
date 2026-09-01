import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "./not-found";

describe("app/not-found.tsx 404 页面", () => {
  it("渲染 404 品牌化内容与回首页链接", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("404");
    // 品牌化
    expect(html).toContain("获客精灵");
    // 回首页链接
    expect(html).toContain('href="/"');
  });
});
