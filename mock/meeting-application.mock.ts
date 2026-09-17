import type {
  ApprovalTimelineItem,
  MeetingApplicationItem,
  MeetingApplicationSavePayload,
} from "../src/api/task/meeting-application/types";
import { defineMock } from "./base";
import {
  attendeeIdsByServiceItem,
  attendees,
  inventory,
  inventoryIdsByOwnerParty,
  parties,
  projects,
  serviceItems,
  serviceTargetIdsByProviderParty,
  serviceTargets,
} from "./business-reference-data";
import { bodyIds, cloneMock, failure, pageResult, success } from "./pilot-document-utils";

let sequence = 3;
let rows: MeetingApplicationItem[] = [
  createSeed("meeting-1", "HY202609001", "draft", "华东慢病产品交流会", "18000.00"),
  createSeed("meeting-2", "HY202609002", "approved", "江苏终端服务提升研讨会", "24000.00"),
];

const timelines = new Map<string, ApprovalTimelineItem[]>([
  [
    "meeting-1",
    [
      {
        id: "timeline-1",
        nodeName: "创建申请",
        operatorName: "系统管理员",
        result: "created",
        comment: "前端先行 Mock 数据",
        operatedAt: "2026-09-06 09:00:00",
      },
    ],
  ],
  [
    "meeting-2",
    [
      {
        id: "timeline-2-1",
        nodeName: "创建申请",
        operatorName: "系统管理员",
        result: "created",
        comment: "提交审批",
        operatedAt: "2026-09-07 09:00:00",
      },
      {
        id: "timeline-2-2",
        nodeName: "部门审批",
        operatorName: "业务主管",
        result: "approved",
        comment: "同意",
        operatedAt: "2026-09-07 15:20:00",
      },
    ],
  ],
]);

function createSeed(
  id: string,
  applyCode: string,
  status: MeetingApplicationItem["status"],
  meetingName: string,
  amount: string
): MeetingApplicationItem {
  const payload: MeetingApplicationSavePayload = {
    meetingDate: id === "meeting-1" ? "2026-09-18" : "2026-09-22",
    principalPartyId: id === "meeting-1" ? "party-a-1" : "party-a-2",
    providerPartyId: id === "meeting-1" ? "party-b-1" : "party-b-2",
    projectId: id === "meeting-1" ? "project-1" : "project-2",
    serviceItemId: id === "meeting-1" ? "service-2" : "service-1",
    inventoryId: id === "meeting-1" ? "inv-2" : "inv-3",
    targetType: id === "meeting-1" ? "customer" : "outlet",
    targetId: id === "meeting-1" ? "target-c-2" : "target-o-2",
    meetingName,
    serviceTitle: "产品知识与终端服务实践",
    address: id === "meeting-1" ? "上海市浦东新区世纪大道 100 号" : "南京市玄武区中山路 20 号",
    controlLocation: true,
    longitude: id === "meeting-1" ? "121.505000" : "118.796000",
    latitude: id === "meeting-1" ? "31.235000" : "32.060000",
    amount,
    attachments: [{ name: "会议方案.pdf", url: "/pilot-files/meeting-plan.pdf" }],
    remark: "用于验证会议申请整单迁移",
    budgets: [
      {
        id: `${id}-budget-1`,
        budgetType: "场地费",
        estimatedAmount: "8000.00",
        remark: "会议场地",
      },
      {
        id: `${id}-budget-2`,
        budgetType: "讲课费",
        estimatedAmount: "5000.00",
        remark: "讲者费用",
      },
    ],
    attendees: [
      {
        id: `${id}-attendee-1`,
        candidateId: id === "meeting-1" ? "person-5" : "person-3",
        name: id === "meeting-1" ? "陈启明" : "赵海峰",
        mobile: id === "meeting-1" ? "13900002002" : "13800001003",
        checkinStatus: status === "approved" ? "checked" : "pending",
        checkinTime: status === "approved" ? "2026-09-22 13:50:00" : "",
        feedback: "",
      },
    ],
    agenda: [
      {
        id: `${id}-agenda-1`,
        startTime: "14:00",
        endTime: "14:30",
        subject: "产品进展",
        speaker: "张老师",
      },
      {
        id: `${id}-agenda-2`,
        startTime: "14:30",
        endTime: "15:30",
        subject: "病例讨论",
        speaker: "李老师",
      },
    ],
  };
  return materialize(id, applyCode, payload, {
    status,
    createdTime: "2026-09-06 09:00:00",
    version: 0,
  });
}

function budgetTotal(payload: MeetingApplicationSavePayload) {
  return payload.budgets
    .reduce((total, item) => total + Number(item.estimatedAmount || 0), 0)
    .toFixed(2);
}

function validate(payload: MeetingApplicationSavePayload) {
  const principal = parties.find(
    (row) => row.id === payload.principalPartyId && row.active && row.role !== "provider"
  );
  const provider = parties.find(
    (row) => row.id === payload.providerPartyId && row.active && row.role !== "principal"
  );
  const project = projects.find(
    (row) =>
      row.id === payload.projectId &&
      row.active &&
      row.principalPartyId === payload.principalPartyId
  );
  const service = serviceItems.find(
    (row) =>
      row.id === payload.serviceItemId &&
      row.active &&
      project?.serviceItemId === row.id &&
      row.targetType === payload.targetType
  );
  const product = inventory.find(
    (row) =>
      row.id === payload.inventoryId &&
      row.active &&
      inventoryIdsByOwnerParty[payload.principalPartyId]?.includes(row.id)
  );
  const target = serviceTargets.find(
    (row) =>
      row.id === payload.targetId &&
      row.active &&
      row.type === payload.targetType &&
      serviceTargetIdsByProviderParty[payload.providerPartyId]?.includes(row.id)
  );
  if (
    !payload.meetingDate ||
    !principal ||
    !provider ||
    !project ||
    !service ||
    !product ||
    !target
  )
    return "会议申请基础资料或依赖关系无效";
  if (!payload.meetingName.trim() || !payload.serviceTitle.trim() || !payload.address.trim())
    return "会议名称、主题和地址不能为空";
  if (!payload.budgets.length) return "费用预算不能为空";
  if (
    payload.budgets.some(
      (item) =>
        !item.budgetType ||
        !/^\d+(\.\d{1,2})?$/.test(item.estimatedAmount) ||
        Number(item.estimatedAmount) <= 0
    )
  )
    return "费用预算存在无效行";
  if (Number(payload.amount) < Number(budgetTotal(payload))) return "申请金额不能小于费用预算合计";
  if (payload.controlLocation && (!payload.longitude || !payload.latitude))
    return "请填写签到经纬度";
  if (!payload.attendees.length) return "参会人员不能为空";
  const attendeeInvalid = payload.attendees.some(
    (item) =>
      item.candidateId != null &&
      !attendees.some(
        (candidate) =>
          candidate.id === item.candidateId &&
          candidate.active &&
          candidate.targetId === payload.targetId &&
          attendeeIdsByServiceItem[payload.serviceItemId]?.includes(candidate.id)
      )
  );
  if (attendeeInvalid) return "参会人员与服务项目或参会对象不匹配";
  const attendeeKeys = payload.attendees.map(
    (item) => item.candidateId || `${item.name}:${item.mobile}`
  );
  if (new Set(attendeeKeys).size !== attendeeKeys.length) return "参会人员不能重复";
  if (payload.remark.includes("保存失败")) return "已按约定模拟整单保存失败，输入应全部保留";
  return "";
}

function materialize(
  id: string,
  applyCode: string,
  payload: MeetingApplicationSavePayload,
  previous?: Pick<MeetingApplicationItem, "status" | "createdTime" | "version">
): MeetingApplicationItem {
  const principal = parties.find((row) => row.id === payload.principalPartyId)!;
  const provider = parties.find((row) => row.id === payload.providerPartyId)!;
  const project = projects.find((row) => row.id === payload.projectId)!;
  const service = serviceItems.find((row) => row.id === payload.serviceItemId)!;
  const product = inventory.find((row) => row.id === payload.inventoryId)!;
  const target = serviceTargets.find((row) => row.id === payload.targetId);
  return {
    id,
    applyCode,
    ...cloneMock(payload),
    principalPartyName: principal.name,
    providerPartyName: provider.name,
    projectName: project.name,
    serviceItemName: service.name,
    inventoryName: product.name,
    targetName: target?.name ?? "",
    budgetTotal: budgetTotal(payload),
    status: previous?.status ?? "draft",
    createdBy: "系统管理员",
    createdTime: previous?.createdTime ?? "2026-09-10 10:00:00",
    version: (previous?.version ?? 0) + 1,
  };
}

function transition(
  ids: string[],
  allowed: MeetingApplicationItem["status"][],
  target: MeetingApplicationItem["status"],
  nodeName: string,
  result: ApprovalTimelineItem["result"],
  comment: string
) {
  if (!ids.length) return failure("请选择需要操作的会议申请");
  const selected = rows.filter((row) => ids.includes(row.id));
  if (selected.length !== ids.length || selected.some((row) => !allowed.includes(row.status)))
    return failure("会议申请当前状态不允许该操作");
  rows = rows.map((row) =>
    ids.includes(row.id) ? { ...row, status: target, version: row.version + 1 } : row
  );
  ids.forEach((id) => {
    const list = timelines.get(id) ?? [];
    list.push({
      id: `timeline-${crypto.randomUUID()}`,
      nodeName,
      operatorName: "系统管理员",
      result,
      comment,
      operatedAt: "2026-09-10 10:30:00",
    });
    timelines.set(id, list);
  });
  return success({ affectedIds: ids });
}

export default defineMock([
  {
    url: "pilot/meeting-applications",
    method: ["GET"],
    body: ({ query }: { query: Record<string, unknown> }) =>
      success(
        pageResult(
          rows,
          query,
          (row) =>
            `${row.applyCode} ${row.meetingName} ${row.projectName} ${row.principalPartyName} ${row.providerPartyName}`,
          "meetingDate"
        )
      ),
  },
  {
    url: "pilot/meeting-applications",
    method: ["POST"],
    body({ body }: { body: MeetingApplicationSavePayload }) {
      const error = validate(body);
      if (error) return failure(error);
      const id = `meeting-${sequence}`;
      const applyCode = `HY202609${String(sequence).padStart(3, "0")}`;
      sequence++;
      const item = materialize(id, applyCode, body);
      rows = [item, ...rows];
      timelines.set(id, [
        {
          id: `timeline-${crypto.randomUUID()}`,
          nodeName: "创建申请",
          operatorName: "系统管理员",
          result: "created",
          comment: "前端先行 Mock 保存",
          operatedAt: "2026-09-10 10:00:00",
        },
      ]);
      return success({ id, applyCode, version: item.version }, "会议申请整单已保存到内存 Mock");
    },
  },
  {
    url: "pilot/meeting-applications/remove",
    method: ["POST"],
    body({ body }: { body?: Record<string, unknown> }) {
      const ids = bodyIds(body);
      const selected = rows.filter((row) => ids.includes(row.id));
      if (!ids.length || selected.length !== ids.length) return failure("待删除会议申请不存在");
      if (selected.some((row) => row.status !== "draft")) return failure("只有草稿可以删除");
      rows = rows.filter((row) => !ids.includes(row.id));
      ids.forEach((id) => timelines.delete(id));
      return success({ affectedIds: ids });
    },
  },
  {
    url: "pilot/meeting-applications/submit",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(
        bodyIds(body),
        ["draft", "rejected"],
        "pending",
        "提交审批",
        "pending",
        "待部门审批"
      ),
  },
  {
    url: "pilot/meeting-applications/approve",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(
        bodyIds(body),
        ["pending"],
        "approved",
        "部门审批",
        "approved",
        String(body?.comment || "同意")
      ),
  },
  {
    url: "pilot/meeting-applications/revoke",
    method: ["POST"],
    body: ({ body }: { body?: Record<string, unknown> }) =>
      transition(bodyIds(body), ["pending", "approved"], "draft", "撤回申请", "created", "已撤回"),
  },
  {
    url: "pilot/meeting-applications/:id/timeline",
    method: ["GET"],
    body: ({ params }: { params: { id: string } }) => success(timelines.get(params.id) ?? []),
  },
  {
    url: "pilot/meeting-applications/:id",
    method: ["GET"],
    body({ params }: { params: { id: string } }) {
      const item = rows.find((row) => row.id === params.id);
      return item ? success(item) : failure("会议申请不存在", "PILOT_NOT_FOUND");
    },
  },
  {
    url: "pilot/meeting-applications/:id",
    method: ["PUT"],
    body({
      params,
      body,
    }: {
      params: { id: string };
      body: MeetingApplicationSavePayload & { version: number };
    }) {
      const index = rows.findIndex((row) => row.id === params.id);
      const current = rows[index];
      if (!current) return failure("会议申请不存在", "PILOT_NOT_FOUND");
      if (!["draft", "rejected"].includes(current.status)) return failure("当前状态不能编辑");
      if (current.version !== body.version) return failure("申请已被更新，请重新打开");
      const error = validate(body);
      if (error) return failure(error);
      const next = materialize(current.id, current.applyCode, body, current);
      rows[index] = next;
      return success({ id: next.id, applyCode: next.applyCode, version: next.version });
    },
  },
]);
