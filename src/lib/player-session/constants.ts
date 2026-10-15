/** localStorage keys for the device token session (#10). */
export const STORAGE_KEYS = {
  deviceToken: "cbt_device_token",
  playerId: "cbt_player_id",
  playerName: "cbt_player_name",
  ageVerified: "cbt_age_verified_v1",
  judgeNoticeAck: "cbt_judge_notice_ack_v1",
  recoveryAckPrefix: "cbt_recovery_ack_",
} as const;

export const JUDGE_CONTENT_NOTICE =
  "You'll judge messages other players wrote. Some will be offensive. You can skip any of them.";

export const TAGLINE = "Get it past the filter.";
