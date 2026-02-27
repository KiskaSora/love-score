## ❤️ Love Score
love score for you and you SillyTavern ♥
#Features
**Floating heart widget** — draggable, resizable, fills up as the score grows
- **Per-chat score tracking** — each chat has its own independent score
- **Score change rules** — define what actions raise or lower the score, with custom deltas
- **Behavior ranges** — describe how the character acts at different score levels; the active range is injected into the prompt automatically
- **Romantic milestones** — events the character must initiate when the score reaches a threshold; get marked as done automatically when the bot includes the trigger tag
- **AI auto-generation** — connect any OpenAI-compatible API and generate rules, ranges and milestones tailored to the specific character in one click
- **Language selector** — generate descriptions in Russian or English
- **Special instructions field** — guide the AI with optional free-text notes before generating
- **Auto max score** — if the AI suggests a higher max (e.g. 250 for a cold character), it is applied automatically
- **Character avatar preview** — shows the selected character's avatar next to the dropdown
- **Gradual progression mode** — limits score changes to ±1 per response for slower pacing

  ## 📦 Installation

1. Open SillyTavern → **Extensions** → **Install extension**
2. Paste the repository URL:
   ```
   https://github.com/YOUR_USERNAME/love-score
   ```
3. Click **Install** and reload the page
4. The ❤️ Love Score panel will appear in the Extensions sidebar


## 🚀 Quick Start

1. Open a chat with a character
2. Go to Extensions → ❤️ Love Score
3. Click **Сгенерировать** — the extension reads the character card and auto-fills all rules, ranges and milestones via AI
4. Start chatting — the widget updates automatically after each bot response

## 🤖 How the Bot Reads the Score

The extension injects a hidden system block into every message. The bot is expected to reply with a score tag at the end of each response:

```
<!-- [LOVE_SCORE:47] -->
```

When a romantic milestone is completed:

```
<!-- [MILESTONE:30] -->
```

The extension detects these tags automatically and updates the widget.




