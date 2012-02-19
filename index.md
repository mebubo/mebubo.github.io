---
layout: default
title: mebubo
---
{% for post in site.posts %}
<article class="post">
  <time> {{ post.date | date_to_string }} </time>
  <header>
    <h2><a href="{{ post.url }}"> {{ post.title }}</a></h2>
  </header>
  {{ post.content }}
</article>
{% endfor %}


