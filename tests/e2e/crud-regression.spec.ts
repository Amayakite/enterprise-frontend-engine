import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const runId = `${Date.now().toString(36)}-${process.pid}`.toUpperCase();
const testValue = (suffix: string) => `E2E-${runId}-${suffix}`;
let browserErrors: string[] = [];

function isKnownBrowserNoise(message: string) {
  return message.includes("ResizeObserver loop completed with undelivered notifications.");
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const path = testInfo.outputPath(name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  await testInfo.attach(name, { path, contentType: "application/json" });
}

async function signIn(page: Page) {
  await page.goto("/#/login");
  await page.getByPlaceholder("验证码").fill("e2e");
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(/#\/(?:dashboard)?$/);
}

async function openReference(page: Page, title: string) {
  await expect(page.getByRole("combobox", { name: title })).toBeEditable();
  const selectButton = page.getByRole("button", { name: `选择${title}` });
  await expect(selectButton).toBeEnabled();
  await selectButton.click();
  const dialog = page.getByRole("dialog", { name: `选择${title}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectReference(page: Page, title: string, label: string) {
  const dialog = await openReference(page, title);
  await dialog.getByRole("button", { name: new RegExp(`^暂选${label}`) }).click();
  await dialog.getByRole("button", { name: "确定" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("固定 CRUD 浏览器回归", () => {
  test.beforeEach(async ({ page }) => {
    browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !isKnownBrowserNoise(message.text()))
        browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      if (!isKnownBrowserNoise(error.message)) browserErrors.push(`pageerror: ${error.message}`);
    });
  });

  test.afterEach(async ({}, testInfo) => {
    await attachJson(testInfo, "browser-errors.json", {
      ignored: "ResizeObserver loop completed with undelivered notifications.",
      unexpected: browserErrors,
    });
    expect(browserErrors).toEqual([]);
  });

  test("销售组织可在抽屉新增、修改并进入详情", async ({ page }) => {
    const code = testValue("SALE");
    const initialName = testValue("销售组织");
    const updatedName = testValue("销售组织已修改");

    await signIn(page);
    await page.goto("/#/base/sale");
    await page.getByRole("button", { name: "新增", exact: true }).click();

    const createDrawer = page.getByRole("dialog", { name: "新增销售组织" });
    await expect(createDrawer).toBeVisible();
    await expect(createDrawer.getByRole("navigation", { name: "表单分区" })).toHaveCount(0);
    await createDrawer.getByRole("textbox", { name: "组织编码" }).fill(code);
    await createDrawer.getByRole("textbox", { name: "组织名称" }).fill(initialName);
    await createDrawer.getByRole("button", { name: "保存" }).click();
    await expect(createDrawer).toBeHidden();

    const createdRow = page.getByRole("row", { name: new RegExp(code) });
    await expect(createdRow).toContainText(initialName);
    await createdRow.getByRole("button", { name: "编辑" }).click();

    const editDrawer = page.getByRole("dialog", { name: "编辑销售组织" });
    await expect(editDrawer).toBeVisible();
    await editDrawer.getByRole("textbox", { name: "组织名称" }).fill(updatedName);
    await editDrawer.getByRole("button", { name: "保存" }).click();
    await expect(editDrawer).toBeHidden();

    const updatedRow = page.getByRole("row", { name: new RegExp(code) });
    await expect(updatedRow).toContainText(updatedName);
    await updatedRow.getByRole("button", { name: "详情" }).click();
    await expect(page).toHaveURL(/#\/base\/sale\/detail\//);
    await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
    await expect(page.getByText(code, { exact: true })).toBeVisible();
  });

  test("客户主子表可整单保存，并可在编辑页修改", async ({ page }) => {
    const customerName = testValue("客户");
    const contactName = testValue("联系人");
    const addressLabel = testValue("收货地址");
    const updatedShortName = testValue("客户简称");

    await signIn(page);
    await page.goto("/#/base/customer");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await expect(page).toHaveURL(/#\/base\/customer\/add$/);

    await selectReference(page, "销售组织", "华东销售组织");
    await page.getByRole("textbox", { name: "客户名称" }).fill(customerName);
    await selectReference(page, "省份", "上海市");
    await selectReference(page, "城市", "上海市");
    await selectReference(page, "区县", "浦东新区");
    await page.getByRole("textbox", { name: "详细地址" }).fill("E2E 张江路 88 号");

    const addRowButtons = page.getByRole("button", { name: "新增行" });
    await expect(addRowButtons).toHaveCount(2);
    await addRowButtons.first().click();
    await page.getByRole("textbox", { name: "姓名" }).fill(contactName);
    await page.getByRole("textbox", { name: "联系电话" }).last().fill("13800001234");
    await page
      .getByRole("textbox", { name: "邮箱" })
      .fill(`e2e-${runId.toLowerCase()}@example.com`);
    await page.getByRole("button", { name: "确认" }).click();
    await expect(page.getByText(contactName, { exact: true })).toBeVisible();

    await addRowButtons.nth(1).click();
    const addressDrawer = page.getByRole("dialog", { name: /收货地址/ });
    await expect(addressDrawer).toBeVisible();
    await addressDrawer.getByRole("textbox", { name: "地址名称" }).fill(addressLabel);
    await addressDrawer.getByRole("textbox", { name: "收货人" }).fill(contactName);
    await addressDrawer.getByRole("textbox", { name: "联系电话" }).fill("13800001234");
    await addressDrawer.getByRole("textbox", { name: "收货地址" }).fill("E2E 张江路 88 号");
    await addressDrawer.getByRole("button", { name: "确定" }).click();
    await expect(addressDrawer).toBeHidden();

    await page.getByText("我已核对客户资料", { exact: true }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page).toHaveURL(/#\/base\/customer\/detail\//);
    await expect(page.getByRole("heading", { name: customerName })).toBeVisible();
    await expect(
      page.getByRole("tabpanel", { name: "联系人" }).getByText(contactName, { exact: true })
    ).toBeVisible();
    await page.getByRole("tab", { name: "收货地址" }).click();
    await expect(page.getByText(addressLabel, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "编辑" }).click();
    await expect(page).toHaveURL(/#\/base\/customer\/edit\//);
    await page.getByRole("textbox", { name: "客户简称" }).fill(updatedShortName);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page).toHaveURL(/#\/base\/customer\/detail\//);
    await expect(page.getByText(updatedShortName, { exact: true })).toBeVisible();
  });

  test("参照前往新增可自动回填，取消未保存销售组织会回到来源", async ({ page }) => {
    const sourceCustomerName = testValue("来源客户");
    const saleCode = testValue("REF");
    const saleName = testValue("参照销售组织");

    await signIn(page);
    await page.goto("/#/base/customer");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await expect(page).toHaveURL(/#\/base\/customer\/add$/);
    const customerName = page.getByRole("textbox", { name: "客户名称" });
    await customerName.fill(sourceCustomerName);

    let referenceDialog = await openReference(page, "销售组织");
    await referenceDialog.getByRole("button", { name: "前往新增销售组织" }).click();
    const cancelledDrawer = page.getByRole("dialog", { name: "新增销售组织" });
    await expect(cancelledDrawer).toBeVisible();
    await cancelledDrawer.getByRole("button", { name: "取消" }).click();
    await expect(cancelledDrawer).toBeHidden();
    await expect(customerName).toHaveValue(sourceCustomerName);
    await referenceDialog.getByRole("button", { name: "取消" }).click();
    await expect(referenceDialog).toBeHidden();

    referenceDialog = await openReference(page, "销售组织");
    await referenceDialog.getByRole("button", { name: "前往新增销售组织" }).click();
    const createDrawer = page.getByRole("dialog", { name: "新增销售组织" });
    await expect(createDrawer).toBeVisible();
    await createDrawer.getByRole("textbox", { name: "组织编码" }).fill(saleCode);
    await createDrawer.getByRole("textbox", { name: "组织名称" }).fill(saleName);
    await createDrawer.getByRole("button", { name: "保存" }).click();
    await expect(createDrawer).toBeHidden();
    await expect(customerName).toHaveValue(sourceCustomerName);
    await expect(page.getByRole("combobox", { name: "销售组织" })).toHaveValue(saleName);
  });

  test("客户错误汇总可定位到客户名称", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/base/customer/add");
    const sections = page.getByRole("navigation", { name: "表单分区" });
    await expect(sections.getByRole("button")).toHaveText([
      "基本信息",
      "区域与联系",
      "其他信息",
      "联系人",
      "收货地址",
    ]);
    await page.getByRole("button", { name: "保存" }).click();

    const summary = page.getByRole("region", { name: "表单错误汇总" });
    await expect(summary).toBeVisible();
    await summary.getByRole("button", { name: /客户名称：/ }).click();
    await expect(page.getByRole("textbox", { name: "客户名称" })).toBeFocused();
  });

  test("500 行明细会切到末页并聚焦错误，修正后可保存", async ({ page }, testInfo) => {
    const title = testValue("500行性能单");

    await signIn(page);
    await page.goto("/#/component-lab/crud");
    await page.getByRole("button", { name: "新增", exact: true }).click();
    const titleInput = page.getByRole("textbox", { name: "名称" });
    await expect(titleInput).toBeVisible();
    await titleInput.fill(title);
    await page.getByRole("textbox", { name: "金额" }).fill("500.00");

    const loadStartedAt = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "装入 500 行测试明细" }).click();
    const performanceStatus = page.getByRole("status", { name: "性能测试数据" });
    await expect(performanceStatus).toHaveText("当前 500 行");
    const loadedAt = await page.evaluate(() => performance.now());

    await expect(page.getByRole("row").filter({ hasText: /性能测试明细/ })).toHaveCount(10);
    const pagination = page.getByRole("navigation", { name: "分页导航" });
    await expect(pagination).toContainText("共 500 条");
    await expect(pagination).toContainText("10条/页");

    const editStartedAt = await page.evaluate(() => performance.now());
    for (let index = 0; index < 10; index++) await titleInput.fill(`${title}-${index + 1}`);
    const editCompletedAt = await page.evaluate(() => performance.now());

    const validationStartedAt = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "制造末页明细错误" }).click();
    await page.getByRole("button", { name: "保存", exact: true }).click();
    const summary = page.getByRole("region", { name: "表单错误汇总" });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("业务明细");
    await expect(pagination.getByRole("listitem", { name: "第 50 页" })).toBeVisible();
    const lastLineName = page.getByRole("textbox", { name: "明细名称" });
    await expect(lastLineName).toBeFocused();

    await lastLineName.fill("性能测试明细 500");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    const savedAt = await page.evaluate(() => performance.now());
    await attachJson(testInfo, "500-row-performance.json", {
      mainFieldTenEditsMs: Number((editCompletedAt - editStartedAt).toFixed(1)),
      loadRowsMs: Number((loadedAt - loadStartedAt).toFixed(1)),
      validationAndSaveMs: Number((savedAt - validationStartedAt).toFixed(1)),
    });
  });
});
