export const NEWSLETTER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "임시저장",
  READY: "발송대기",
  PUBLISHED: "발행됨",
  ARCHIVED: "보관됨",
};

export const SUBSCRIBER_STATUS_LABEL: Record<string, string> = {
  SUBSCRIBED: "구독중",
  UNSUBSCRIBED: "수신거부",
  BOUNCED: "반송됨",
};

export const SUBSCRIBER_SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "웹사이트",
  MEMBER_SIGNUP: "회원가입",
  IMPORT: "일괄등록",
  MANUAL: "수동등록",
  CONTACT_FORM: "상담폼",
};

export const PROSPECT_SOURCE_LABEL: Record<string, string> = {
  MANUAL: "수동등록",
  IMPORT: "일괄등록",
};

export const CAMPAIGN_SEND_TYPE_LABEL: Record<string, string> = {
  IMMEDIATE: "즉시발송",
  SCHEDULED: "선택일발송",
  RECURRING: "매일자동발송",
  RANGE: "기간발송",
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "임시저장",
  SCHEDULED: "예약됨",
  SENDING: "발송중",
  SENT: "발송완료",
  FAILED: "발송실패",
  CANCELLED: "취소됨",
};

export const BANNER_POSITION_LABEL: Record<string, string> = {
  TOP: "상단",
  MIDDLE: "중단",
  BOTTOM: "하단",
  SIDEBAR: "사이드바",
};
