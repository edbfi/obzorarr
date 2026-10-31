# Plex: how it behaves, as the previous app found it

From the previous app's spec, not re-verified. The Plex library audit (D18) checks these against the
pinned `@ctrl/plex` and Plex Media Server's latest release (D25). Each fact moves into the spec of the
module that relies on it (`setup`, `plex-connection`, `identity`, `sync`, `plex-sign-in`, `stats`,
`recap`, `users-admin`), and this file is deleted once none is left.

## Requests and tokens

- Requests carry a token and Plex's client identification headers.
- Two kinds of token are used. The server token, which the owner configures, reads play history,
  item metadata, the server's identity, its local accounts, artwork, the owner's identity, the
  accepted shares and the proof that the owner owns the server. A user's own token, from their Plex
  sign-in, lists the servers that account can reach: that is how membership is checked and how the
  owner's servers are listed to pick from.

## Play history

- History is read page by page from the history endpoint, optionally filtered to plays viewed after
  a given time.
- Each item has a history key (unique), a library section, a type (movie, episode or track), an
  integer viewed-at time and an account id. Items for deleted media or non-library content can lack
  a rating key or a title.
- The account id is server-local, not a Plex account id. The server's owner is always local account
  1; a shared user's local id equals their Plex account id.
- History doesn't carry the time actually watched (D23; D18 checks for a watched duration or view
  offset).

## Metadata and the server

- An item's metadata gives its duration, genres and release year; a show's gives its episode count,
  which can be fetched for several shows in one batch, and its artwork.
- The server's root answers whether it is reachable and gives its friendly name; the identity
  endpoint gives its machine identifier.

## Accounts, shares and servers

- Plex's account service returns the owner's profile and the shares for one machine. Each share has
  a state (accepted, deleted or left) and an invitation id, and the share list can be paginated. The
  server returns its own local account list.
- The resources list proves which servers an account owns and advertises each server's connections
  (secure direct, remote, local and relay). It can leave out a reachable owned server, and it
  doesn't always advertise a public `plex.direct` address.
- A `plex.direct` host name embeds the server's IP address and machine id; the port is in the URL.

## Sign-in

- Plex signs users in with a PIN: the app creates a PIN and sends the user to Plex's hosted sign-in
  page with a forward URL back to the app.
- Safari and privacy-focused browsers commonly block the sign-in popup.

## Images

- Some avatars are served through an image proxy on Plex's own hosts.
