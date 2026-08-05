export type PublishAccountForm = {
  name: string;
  positioning?: string;
  platform: "douyin" | "wechat_channels" | "kuaishou";
};

export function toPublishAccountInput(
  form: PublishAccountForm
): PublishAccountForm {
  const input: PublishAccountForm = {
    name: form.name.trim(),
    platform: form.platform
  };
  const positioning = form.positioning?.trim();
  if (positioning) input.positioning = positioning;
  return input;
}
