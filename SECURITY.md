# Security

## Threat model

Tandem is a local, single-user server. It listens on `127.0.0.1` only (default port 4317) and acts as you: every GitHub read and write uses your `gh` token, and Push launches or messages Orca agents through the `orca` CLI. Anyone who can make the server act can therefore comment, label and create issues in any repo your token can write to, and start coding agents in your checkouts.

In scope:

- **Other websites in your browser.** A page on another origin must not be able to read the Board or write through the API.
  - DNS rebinding: every `/api` request must carry a `Host` header that names this server (`127.0.0.1:<port>` or `localhost:<port>`); anything else gets 403.
  - CSRF: every write (any method but `GET`/`HEAD`) must have `Content-Type: application/json` and the header `X-Tandem: 1`, which a cross-site form or `no-cors` fetch cannot send without a CORS preflight that Tandem never answers. A present `Origin` must be Tandem's own.
  - Input checks: repo names match `^[\w.-]+$` per segment without `..`, issue numbers are positive integers, and issues and coordinators are only created for repos you opted into in Settings.
- **Content from GitHub.** Issue and comment Markdown is rendered with DOMPurify.

Out of scope:

- Other local users or processes on your machine: they can reach `127.0.0.1` and read `~/.tandem` and your `gh` token anyway.
- Exposing the port to a network (a proxy, a tunnel, `0.0.0.0`): not supported.
- What the agents themselves do once started; that is governed by agent-workflow and Orca.

During `npm run dev` the Vite page on its own port (default 5317) is an allowed origin too, so the dev server writes through its `/api` proxy.

## Reporting a vulnerability

Please report it privately through GitHub's [private vulnerability reporting](https://github.com/jaylouiz/tandem/security/advisories/new) (Security tab → "Report a vulnerability"), not in a public issue. Include the steps to reproduce and the version (`git rev-parse HEAD`). You will get an answer as soon as I can; this is a personal project without a support schedule.
