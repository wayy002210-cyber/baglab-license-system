export type PublishAccountForm = {
  name: string;
  platform: "douyin" | "wechat_channels";
};

export function toPublishAccountInput(
  form: PublishAccountForm
): PublishAccountForm {
  return {
    name: form.name.trim(),
    platform: form.platform
  };
}
