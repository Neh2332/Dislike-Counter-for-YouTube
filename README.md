# Dislike Counter for YouTube

YouTube hid dislike counts. This brings them back.

Open any video or Short and the dislike count appears right next to the likes. It works on your computer and on your phone (Firefox for Android), with nothing to set up.

- See dislikes on videos and Shorts
- Works on desktop and mobile
- No tracking, no ads, no account
- Nothing is saved on your device

## Privacy

The only thing sent is the video's ID, to returnyoutubedislikeapi.com, which looks up the count. No personal info, history or cookies are ever sent.

## Install for development

```bash
npm install --global web-ext
web-ext run
```

Or open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `manifest.json`.

## License

MIT © Neh2332
