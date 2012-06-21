---
layout: post
title: Building tmux statically
---

Here is what I had to do to build [tmux](http://tmux.sourceforge.net/) 1.6 statically on Debian wheezy:

{% highlight sh %}
$ LDFLAGS="-static" LIBS="-lcurses -ltinfo" ./configure
$ make
{% endhighlight %}
