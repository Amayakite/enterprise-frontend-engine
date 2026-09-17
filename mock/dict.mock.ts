import { defineMock } from "./base";

export default defineMock([
  {
    url: "dicts",
    method: ["GET"],
    body: {
      code: "00000",
      data: {
        list: [
          {
            id: "1",
            name: "性别",
            dictCode: "gender",
            status: 1,
          },
        ],
        total: 1,
      },
      msg: "一切ok",
    },
  },

  {
    url: "dicts/options",
    method: ["GET"],
    body: {
      code: "00000",
      data: [
        {
          value: "gender",
          label: "性别",
        },
      ],
      msg: "一切ok",
    },
  },

  // 新增字典
  {
    url: "dicts",
    method: ["POST"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: "新增字典" + body.name + "成功",
      };
    },
  },

  // 获取字典表单数据
  {
    url: "dicts/:id/form",
    method: ["GET"],
    body: ({ params }) => {
      return {
        code: "00000",
        data: dictMap[params.id],
        msg: "一切ok",
      };
    },
  },

  // 修改字典
  {
    url: "dicts/:id",
    method: ["PUT"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: "修改字典" + body.name + "成功",
      };
    },
  },

  // 删除字典
  {
    url: "dicts/:ids",
    method: ["DELETE"],
    body({ params }) {
      return {
        code: "00000",
        data: null,
        msg: "删除字典" + params.ids + "成功",
      };
    },
  },

  //---------------------------------------------------
  // 字典项相关接口
  //---------------------------------------------------

  // 字典项分页列表
  {
    url: "dicts/:dictCode/items",
    method: ["GET"],
    body: {
      code: "00000",
      data: {
        list: [
          {
            id: "1",
            dictCode: "gender",
            label: "男",
            value: "1",
            sort: 1,
            status: 1,
          },
          {
            id: "2",
            dictCode: "gender",
            label: "女",
            value: "2",
            sort: 2,
            status: 1,
          },
          {
            id: "3",
            dictCode: "gender",
            label: "保密",
            value: "0",
            sort: 3,
            status: 1,
          },
        ],
        total: 3,
      },
      msg: "一切ok",
    },
  },
  // 字典项列表
  {
    url: "dicts/:dictCode/items/options",
    method: ["GET"],
    body: ({ params }) => {
      const dictCode = params.dictCode;

      let list = null;

      if (dictCode == "gender") {
        list = [
          {
            value: "1",
            label: "男",
          },
          {
            value: "2",
            label: "女",
          },
          {
            value: "0",
            label: "保密",
          },
        ];
      } else if (dictCode == "notice_level") {
        list = [
          {
            value: "L",
            label: "低",
            tag: "info",
          },
          {
            value: "M",
            label: "中",
            tag: "warning",
          },
          {
            value: "H",
            label: "高",
            tag: "danger",
          },
        ];
      } else if (dictCode == "notice_type") {
        list = [
          {
            value: "1",
            label: "系统升级",
            tag: "success",
          },
          {
            value: "2",
            label: "系统维护",
            tag: "primary",
          },
          {
            value: "3",
            label: "安全警告",
            tag: "danger",
          },
          {
            value: "4",
            label: "假期通知",
            tag: "success",
          },
          {
            value: "5",
            label: "公司新闻",
            tag: "primary",
          },
          {
            value: "99",
            label: "其他",
            tag: "info",
          },
        ];
      } else if (dictCode === "customer_type") {
        list = [
          { value: "distributor", label: "医药商业" },
          { value: "chain", label: "连锁药店" },
          { value: "hospital", label: "医疗机构" },
        ];
      } else if (dictCode === "customer_status") {
        list = [
          { value: "pending", label: "待审核", tag: "warning" },
          { value: "approved", label: "已审核", tag: "success" },
        ];
      } else if (dictCode == "pilot_document_status") {
        list = [
          { value: "draft", label: "未审核", tag: "warning" },
          { value: "approved", label: "已审核", tag: "success" },
        ];
      } else if (dictCode == "pilot_meeting_status") {
        list = [
          { value: "draft", label: "草稿", tag: "info" },
          { value: "pending", label: "审批中", tag: "warning" },
          { value: "approved", label: "已审批", tag: "success" },
          { value: "rejected", label: "已驳回", tag: "danger" },
        ];
      } else if (dictCode == "pilot_target_type") {
        list = [
          { value: "outlet", label: "网点" },
          { value: "customer", label: "商业" },
        ];
      } else if (dictCode == "pilot_calculate_basis") {
        list = [
          { value: "fixed", label: "固定金额" },
          { value: "person", label: "按人数" },
          { value: "quantity", label: "按数量" },
        ];
      } else if (dictCode == "pilot_budget_type") {
        list = [
          { value: "场地费", label: "场地费" },
          { value: "讲课费", label: "讲课费" },
          { value: "资料费", label: "资料费" },
          { value: "交通费", label: "交通费" },
          { value: "其他", label: "其他" },
        ];
      } else if (dictCode == "pilot_attendee_status") {
        list = [
          { value: "pending", label: "未签到", tag: "info" },
          { value: "checked", label: "已签到", tag: "success" },
        ];
      }

      return {
        code: "00000",
        data: list,
        msg: "一切ok",
      };
    },
  },
  // 新增字典项
  {
    url: "dicts/:dictCode/items",
    method: ["POST"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: "新增字典" + body.name + "成功",
      };
    },
  },

  // 字典项表单数据
  {
    url: "dicts/:dictCode/items/:itemId/form",
    method: ["GET"],
    body: ({ params }) => {
      return {
        code: "00000",
        data: dictItemMap[params.itemId],
        msg: "一切ok",
      };
    },
  },

  // 修改字典项
  {
    url: "dicts/:dictCode/items/:itemId",
    method: ["PUT"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: "修改字典项" + body.name + "成功",
      };
    },
  },

  // 删除字典
  {
    url: "dicts/:dictCode/items/:itemId",
    method: ["DELETE"],
    body({ params }) {
      return {
        code: "00000",
        data: null,
        msg: "删除字典" + params.itemId + "成功",
      };
    },
  },
]);

// 字典映射表数据
const dictMap: Record<string, any> = {
  1: {
    code: "00000",
    data: {
      id: "1",
      name: "性别",
      dictCode: "gender",
      status: 1,
    },
    msg: "一切ok",
  },
};

// 字典项映射表数据
const dictItemMap: Record<string, any> = {
  1: {
    code: "00000",
    data: {
      id: "1",
      value: "1",
      label: "男",
      sort: 1,
      status: 1,
      tagType: "primary",
    },
    msg: "一切ok",
  },
  2: {
    code: "00000",
    data: {
      id: "2",
      value: "2",
      label: "女",
      sort: 2,
      status: 1,
      tagType: "danger",
    },
    msg: "一切ok",
  },
  3: {
    code: "00000",
    data: {
      id: "3",
      value: "0",
      label: "保密",
      sort: 3,
      status: 1,
      tagType: "info",
    },
    msg: "一切ok",
  },
};
