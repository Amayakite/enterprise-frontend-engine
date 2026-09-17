import type { FeedbackEmits, FeedbackProps } from "../../src/components/business/feedback/types";

const inline: FeedbackProps = { message: "页内提示", variant: "inline", closable: false };
const floating: FeedbackProps = { message: "顶部提示", variant: "floating", closable: true };
const emits: FeedbackEmits = { close: [] };

void [inline, floating, emits];
