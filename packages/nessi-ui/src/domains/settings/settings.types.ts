export type CompactionSettings = {
  autoCompactAfterMessages: number;
  keepRecentLoops: number;
  maxToolChars: number;
  maxSourceChars: number;
};

export type ToolApprovalMap = Record<string, boolean>;
