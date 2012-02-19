---
layout: default
title: mebubo
---
{% for post in site.posts %}
<article class="post{% if forloop.last == false %} notlast{% endif %}">
  <time datetime="{{ post.date | date: "%Y-%m-%d" }}"> {{ post.date | date_to_string }} </time>
  <header>
    <h2><a href="{{ post.url }}"> {{ post.title }}</a></h2>
  </header>
  {{ post.content }}
</article>
{% endfor %}


