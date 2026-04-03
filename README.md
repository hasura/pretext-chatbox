# pretext-chatbox

High-performance hybrid chatbox component using [pretext](https://github.com/chenglou/pretext) for text measurement.

## How it works

A transparent `contenteditable` captures all native input (IME, autocorrect, selection, clipboard), while a pretext-powered overlay renders the text visually. The browser's native caret stays visible and correct -- no cursor mapping needed.

See [PLAN.md](./PLAN.md) for the full MVP plan.

## Development

```sh
npm install
npm run dev
```

Dev server runs on port **19847**.
