export const GROUP_ID = "2229558644";
export const OTHER_GROUP_ID = "2142474284";

export function link(messageId, topicId) {
  return topicId
    ? `https://t.me/c/${GROUP_ID}/${topicId}/${messageId}`
    : `https://t.me/c/${GROUP_ID}/${messageId}`;
}

export function config() {
  return {
    qualities: ["1080p", "4K"],
    groups: { [GROUP_ID]: "Grupo 1", [OTHER_GROUP_ID]: "Grupo 2" },
    languages: {
      audio: ["Castellano", "Latino", "Inglés"],
      subs: ["Castellano", "Inglés", "Forzados"],
    },
  };
}
