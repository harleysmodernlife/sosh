"""
Curated Pulse prompt rotation list.
fire_daily_pulse() cycles through these in order using a Redis counter.
Add more prompts to extend the rotation.
"""

PROMPTS: list[str] = [
    "Show us where you are right now.",
    "What are you eating today?",
    "What's the view from your window?",
    "Show us your workspace.",
    "What's the best thing that happened today?",
    "Show us something that made you smile.",
    "What are you listening to right now?",
    "Show us the sky above you.",
    "What's on your desk right now?",
    "Show us your city at this moment.",
    "What are you working on today?",
    "Show us something beautiful near you.",
    "What's your go-to comfort food?",
    "Show us where you go to think.",
    "What does your morning look like?",
    "Show us something that inspires you.",
    "What are you looking forward to this week?",
    "Show us your neighborhood.",
    "What's the last thing that made you laugh?",
    "Show us something you're proud of.",
    "What does your evening routine look like?",
    "Show us your favorite spot in your city.",
    "What's the most interesting thing near you right now?",
    "Show us what you do to unwind.",
    "What's the weather like where you are?",
    "Show us something unexpected about your day.",
    "What are you drinking right now?",
    "Show us the people around you.",
    "What song describes today?",
    "Show us your current vibe.",
]
