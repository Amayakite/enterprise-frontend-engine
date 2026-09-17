import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import axios from "axios";
import qs from "qs";

// 执行真实拦截器源码；只替换认证副作用和网络，避免测试改写真实登录状态。
function harness(realTransport = false) {
  const messages = [],
    redirects = [];
  let refresh = 0,
    permissions = 0,
    permissionRefreshFails = false,
    fulfilled,
    rejected;
  const config = { headers: new axios.AxiosHeaders(), errorPresentation: "local" };
  let nextResponse;
  const http = async () => nextResponse ?? "retried";
  http.interceptors = {
    request: { use() {} },
    response: {
      use(a, b) {
        fulfilled = a;
        rejected = b;
      },
    },
  };
  const mockAxios = {
    ...axios,
    create: (config) =>
      realTransport
        ? axios.create({
            ...config,
            adapter: async (actualConfig) => ({ ...nextResponse, config: actualConfig }),
          })
        : http,
  };
  const modules = {
    axios: { ...mockAxios, default: mockAxios },
    qs: { ...qs, default: qs },
    "@/config/api-codes": {
      ApiCodeEnum: {
        SUCCESS: "00000",
        ACCESS_TOKEN_INVALID: "A0230",
        REFRESH_TOKEN_INVALID: "A0231",
        PERMISSION_DENIED: "A0301",
      },
    },
    "@/stores/user": {
      useUserStoreHook: () => ({
        refreshTokenOnce: async () => {
          refresh++;
        },
      }),
    },
    "@/stores/permission": {
      usePermissionStoreHook: () => ({
        refreshPermissions: async () => {
          permissions++;
          if (permissionRefreshFails) throw new Error("refresh failed");
        },
      }),
    },
    "@/utils/auth": {
      AuthStorage: { getAccessToken: () => "test" },
      redirectToLogin: async (...args) => {
        redirects.push(args);
      },
    },
    "@/utils/feedback": {
      feedback: { error: (message) => messages.push(message) },
    },
  };
  const requestErrorExports = {};
  const requestErrorJs = ts.transpileModule(readFileSync("src/utils/request-error.ts", "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new Function("exports", requestErrorJs)(requestErrorExports);
  modules["@/utils/request-error"] = requestErrorExports;
  const source = readFileSync("src/utils/request.ts", "utf8").replace(
    "import.meta.env.VITE_APP_BASE_API",
    '"/test"'
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: false,
    },
  }).outputText;
  const exports = {};
  new Function("require", "exports", "ElMessage", js)(
    (name) => {
      if (!(name in modules)) throw new Error(`Unexpected module ${name}`);
      return modules[name];
    },
    exports,
    { error: (message) => messages.push(message) }
  );
  const response = (code, cfg = config) => ({
    data: { code, msg: "测试失败", data: { ok: true } },
    config: cfg,
    status: 400,
    statusText: "bad",
    headers: {},
  });
  return {
    messages,
    redirects,
    config,
    response,
    request: exports.default,
    RequestError: requestErrorExports.RequestError,
    classifyRequestSaveError: requestErrorExports.classifyRequestSaveError,
    respond: (response) => {
      nextResponse = response;
    },
    fulfilled: (...args) => fulfilled(...args),
    rejected: (...args) => rejected(...args),
    counters: () => ({ refresh, permissions }),
    failPermissionRefresh() {
      permissionRefreshFails = true;
    },
  };
}
test("普通业务/网络失败默认提示，local 不重复提示，取消一律静默", async () => {
  const h = harness();
  await assert.rejects(h.fulfilled(h.response("FAIL", {})));
  assert.equal(h.messages.length, 1);
  await assert.rejects(h.fulfilled(h.response("FAIL")));
  assert.equal(h.messages.length, 1);
  await assert.rejects(h.rejected(new axios.AxiosError("network")));
  assert.equal(h.messages.length, 2);
  await assert.rejects(h.rejected(new axios.AxiosError("network", "ERR_NETWORK", h.config)));
  assert.equal(h.messages.length, 2);
  await assert.rejects(h.rejected(new axios.CanceledError()));
  assert.equal(h.messages.length, 2);
});
test("local 不能绕过 token 刷新、失效跳转或权限刷新，但权限错误不重复全局提示", async () => {
  const h = harness();
  assert.equal(await h.fulfilled(h.response("A0230")), "retried");
  assert.equal(h.counters().refresh, 1);
  await assert.rejects(
    h.rejected(new axios.AxiosError("expired", "A0231", h.config, undefined, h.response("A0231")))
  );
  assert.equal(h.redirects.length, 1);
  await assert.rejects(h.fulfilled(h.response("A0301")));
  assert.equal(h.counters().permissions, 1);
  assert.equal(h.messages.length, 0);
  await assert.rejects(h.fulfilled(h.response("A0230")));
  assert.equal(h.redirects.length, 2);
});

test("请求错误保留协议信息，保存分类只确认业务或权限拒绝", async () => {
  const h = harness();
  const response = {
    ...h.response("BUSINESS"),
    headers: { "x-request-id": "req-1" },
  };
  await assert.rejects(h.fulfilled(response), (error) => {
    assert.ok(error instanceof h.RequestError);
    assert.equal(error.kind, "business");
    assert.equal(error.owner, "local");
    assert.equal(error.code, "BUSINESS");
    assert.equal(error.status, 400);
    assert.equal(error.requestId, "req-1");
    assert.equal(h.classifyRequestSaveError(error), "rejected");
    return true;
  });
  let network;
  try {
    await h.rejected(new axios.AxiosError("network", "ERR_NETWORK", h.config));
  } catch (error) {
    network = error;
  }
  assert.ok(network instanceof h.RequestError);
  assert.equal(network.kind, "network");
  assert.equal(h.classifyRequestSaveError(network), "unknown");
  assert.equal(h.classifyRequestSaveError(new Error("unwrapped")), "unknown");
});

test("非协议响应和服务端错误保守视为未知，权限刷新失败仍保留权限拒绝", async () => {
  const h = harness();
  await assert.rejects(h.fulfilled({ ...h.response("FAIL"), data: null }), (error) => {
    assert.ok(error instanceof h.RequestError);
    assert.equal(error.kind, "unknown");
    assert.equal(h.classifyRequestSaveError(error), "unknown");
    return true;
  });
  await assert.rejects(
    h.rejected(
      new axios.AxiosError("server", "ERR_BAD_RESPONSE", h.config, undefined, {
        ...h.response("A0301"),
        status: 503,
      })
    ),
    (error) => {
      assert.ok(error instanceof h.RequestError);
      assert.equal(error.kind, "server");
      assert.equal(h.classifyRequestSaveError(error), "unknown");
      assert.equal(h.counters().permissions, 0);
      return true;
    }
  );
  h.failPermissionRefresh();
  await assert.rejects(h.fulfilled(h.response("A0301")), (error) => {
    assert.ok(error instanceof h.RequestError);
    assert.equal(error.kind, "permission");
    assert.equal(h.classifyRequestSaveError(error), "rejected");
    return true;
  });
  assert.equal(h.counters().permissions, 1);
});
test("请求入口解包普通响应，文件响应保留 Axios response 与响应头", async () => {
  const h = harness();
  const ordinary = h.response("00000");
  assert.equal(h.fulfilled(ordinary), ordinary);
  h.respond(ordinary);
  assert.deepEqual(await h.request({ url: "/test" }), { ok: true });
  const binary = h.response("00000", { responseType: "blob" });
  assert.equal(h.fulfilled(binary), binary);
  h.respond(binary);
  assert.equal(await h.request({ url: "/test", responseType: "blob" }), binary);
  const buffer = h.response("00000", { responseType: "arraybuffer" });
  h.respond(buffer);
  assert.equal(await h.request({ url: "/test", responseType: "arraybuffer" }), buffer);
});

test("真实 Axios 管线保持业务解包、二进制响应头和业务拒绝行为", async () => {
  const h = harness(true);
  h.respond(h.response("00000"));
  assert.deepEqual(await h.request({ url: "/ordinary" }), { ok: true });
  const blob = new Blob(["binary"]);
  h.respond({
    ...h.response("00000"),
    data: blob,
    headers: { "content-disposition": "attachment; filename=test.pdf" },
  });
  const binary = await h.request({ url: "/binary", responseType: "blob" });
  assert.equal(binary.data, blob);
  assert.equal(binary.headers["content-disposition"], "attachment; filename=test.pdf");
  h.respond(h.response("FAIL"));
  await assert.rejects(h.request({ url: "/failure", errorPresentation: "local" }), /测试失败/);
  assert.equal(h.messages.length, 0);
});
