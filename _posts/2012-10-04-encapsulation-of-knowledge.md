---
layout: post
title: Encapsulation of knowledge
---

I am a control freak. I like control. I like automation. That's why I
try as much as possible to use software with human-editable config
files. I store those files in a
[git repository](https://github.com/mebubo/dotfiles). Thanks to it,
I'm able to keep my settings in sync across all the machines I
use. And the time it takes to setup a new machine is minutes, not
hours.

I suppose you could call this approach --- human-editable config
files, scripts that automate tasks --- an *encapsulation of
knowledge*.

You are faced with a task: how do I solve a
software-configuration-related problem at hand, e.g. how do I make
some piece of software behave the way I want it to behave? It might
take you hours of googling and reading manuals, but once you've
figured it out, you should be done. Provided that you were able to
formalize your solution in a form of a config file or a script, you
will *never* have to revisit this problem, ever!  You can just throw
it out of your head completely, you don't need it anymore! All the
knowledge you need sits right there in a file in your git repository.

That is of course almost impossible with GUI-based configuration
tools. There, you just have to go through the pain again, again and
again. Eclipse IDE is a good example, that's why I hate its approach
to configuration with passion.

Some software like the Chromium browser try to solve this problem by
auto-synchronization of the (GUI-configured) settings across all
instances of the application, but that is clearly not enough. I want a
common system that works for everything that I use, not some special
mechanism for every piece of software. And I want more control and
flexibility! Chromium for example does not allow me to have slightly
different settings for home and work, but I can easily achieve that
using a `case` statement in my scripts or using git branches for
(human-editable!) config files.

That is why the only piece of my Chromium configuration I feel
confident about (the only one that is in a configuration file that *I
myself* put there) is
[the user style sheet to display Gmail in monospace font](https://github.com/mebubo/dotfiles/blob/master/.config/chromium/Default/User%20StyleSheets/Custom.css).
Everything else is handled by Chromium; it is not in the repo, it is
out of my control, so I might have to reconfigure it one day.

The opposite of that is my Emacs configuration. It is *all*
[there](https://github.com/mebubo/dotfiles/blob/master/.emacs.d/init.el),
always ready to be extended, but never --- to be repeated.
