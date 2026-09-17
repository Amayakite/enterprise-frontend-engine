# 应用字体资源

- `noto-sans-sc-ui.woff2`：Noto Sans SC 可变字体的 UI 子集，覆盖当前 `src/` 中的静态中英文、数字和常用标点。
- `OFL.txt`：随字体分发的 SIL Open Font License 1.1。

## 加载策略

字体由 `src/assets/styles/fonts.scss` 统一声明，使用 `font-display: optional`：首屏始终优先可见，浏览器在慢网或资源紧张时可保留系统字体。接口、字典和用户输入中不在子集内的字符将回退到系统字体，不应将完整 CJK 字体直接加入首屏。

## 更新子集

页面静态文案明显增加时，以 Noto Sans SC 原始可变字体为输入，使用 `pyftsubset` 按 `src/` 的实际字符重新生成 WOFF2；保留变量字重 `100 900`。不要仅按源码子集化动态业务数据，也不要删除 `OFL.txt`。
