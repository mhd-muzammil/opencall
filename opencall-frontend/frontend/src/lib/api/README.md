# OpenCall API client

This folder contains the platform-neutral API client. The web app uses
`webApiClient.ts`, which reads `NEXT_PUBLIC_API_BASE_URL`.

React Native should use `createOpenCallApiClient` directly:

```ts
import { createOpenCallApiClient } from "./api";

export const api = createOpenCallApiClient({
  baseUrl: "https://your-api-host.example.com",
});
```

Keep auth token storage outside this client. On web, the app currently uses
`localStorage`; on mobile, store the token in secure storage and pass it into
the API methods that require `token`.

For uploads in React Native, pass file objects in this shape:

```ts
{
  uri: fileUri,
  name: "call-plan.xlsx",
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}
```
