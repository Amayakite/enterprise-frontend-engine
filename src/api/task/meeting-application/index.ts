import request from "@/utils/request";
import type { PageResult } from "@/types/http";
import type {
  ApprovalTimelineItem,
  MeetingApplicationActionResult,
  MeetingApplicationItem,
  MeetingApplicationQueryParams,
  MeetingApplicationSavePayload,
  MeetingApplicationSaveResult,
} from "./types";

const BASE_URL = "/api/v1/pilot/meeting-applications";

const MeetingApplicationAPI = {
  getPage(params: MeetingApplicationQueryParams, signal?: AbortSignal) {
    return request<unknown, PageResult<MeetingApplicationItem>>({
      url: BASE_URL,
      method: "get",
      params,
      signal,
    });
  },
  getDetail(id: string, signal?: AbortSignal) {
    return request<unknown, MeetingApplicationItem>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "get",
      signal,
    });
  },
  getTimeline(id: string, signal?: AbortSignal) {
    return request<unknown, ApprovalTimelineItem[]>({
      url: `${BASE_URL}/${encodeURIComponent(id)}/timeline`,
      method: "get",
      signal,
    });
  },
  create(data: MeetingApplicationSavePayload, signal?: AbortSignal) {
    return request<unknown, MeetingApplicationSaveResult>({
      url: BASE_URL,
      method: "post",
      data,
      signal,
    });
  },
  update(
    id: string,
    data: MeetingApplicationSavePayload & { version: number },
    signal?: AbortSignal
  ) {
    return request<unknown, MeetingApplicationSaveResult>({
      url: `${BASE_URL}/${encodeURIComponent(id)}`,
      method: "put",
      data,
      signal,
    });
  },
  remove(ids: string[], signal?: AbortSignal) {
    return request<unknown, MeetingApplicationActionResult>({
      url: `${BASE_URL}/remove`,
      method: "post",
      data: { ids },
      signal,
    });
  },
  submit(ids: string[], signal?: AbortSignal) {
    return request<unknown, MeetingApplicationActionResult>({
      url: `${BASE_URL}/submit`,
      method: "post",
      data: { ids },
      signal,
    });
  },
  approve(ids: string[], comment?: string, signal?: AbortSignal) {
    return request<unknown, MeetingApplicationActionResult>({
      url: `${BASE_URL}/approve`,
      method: "post",
      data: { ids, comment },
      signal,
    });
  },
  revoke(ids: string[], signal?: AbortSignal) {
    return request<unknown, MeetingApplicationActionResult>({
      url: `${BASE_URL}/revoke`,
      method: "post",
      data: { ids },
      signal,
    });
  },
};

export default MeetingApplicationAPI;
export * from "./types";
