import { defineMock } from "./base";
import { success } from "./pilot-document-utils";

export default defineMock([
  {
    url: "files",
    method: ["POST"],
    body: () =>
      success({
        name: `试点附件-${Date.now()}.pdf`,
        url: `/api/v1/pilot-files/${Date.now()}.pdf`,
      }),
  },
  {
    url: "files",
    method: ["DELETE"],
    body: () => success(null, "Mock 附件已移除"),
  },
  {
    url: "pilot-files/:name",
    method: ["GET"],
    headers: { "Content-Type": "application/octet-stream" },
    body: ({ params }: { params: { name: string } }) => `Mock file: ${params.name}`,
  },
]);

