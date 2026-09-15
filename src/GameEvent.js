export function createGameEvent(type, {
    source = null,
    sourceType = null,
    subject = source,
    subjectType = sourceType,
    subjectId = subject?.id ?? null,
    position = subject?.position ?? subject?.pos ?? null,
    data = {},
} = {}) {
    return {
        type,
        source,
        sourceType,
        subject,
        subjectType,
        subjectId,
        position: position?.clone ? position.clone() : position,
        data,
    };
}
