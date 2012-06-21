---
layout: post
title: Bluetooth tethering with blues-tools and Cyanogenmod
---

I have to admit that I kind of like Bluetooth technology. It
[works great](/2011/12/26/bluetooth-mouse-in-linux-using-blues.html)
for a wireless mouse, and I also use it to tether my Android phone
which is running [Cyanogenmod](http://www.cyanogenmod.com/) 7.2. Here
is how.

First, we need to pair the devices, the process which I have
[already described](/2011/12/26/bluetooth-mouse-in-linux-using-blues.html). To
recap:

{% highlight sh %}
$ bt-adapter -d   # note the MAC address in the output
$ bt-device -c <MAC address>
$ bt-device --set <MAC address> Alias desire
{% endhighlight %}

Here I've chosen "desire" as an alias for my phone (it's an HTC
Desire). Once the devices are paired, the rest is easy. The important
command is `bt-network -c <alias> nap`. I've written a small script to
wait for bluetooth connection and to launch dhcp client once it is
established:

{% highlight sh %}
#!/bin/sh

DHCP_CMD="sudo dhclient -d bnep0"
BT_CMD="bt-network -c desire nap"
RETRIES=10
CONNECTED="Network service is connected"

out=/tmp/bt-network.out.$$

trap cleanup TERM INT EXIT

$BT_CMD >$out 2>&1 &
bt_pid=$!

cleanup () {
    rm $out > /dev/null 2>&1
}

echo -n "*** Waiting for bluetooth connection..."

for i in $(seq $RETRIES); do
    if grep "$CONNECTED" $out >/dev/null 2>&1; then
        echo "\n*** Bluetooth connection established:\n"
        cat $out
        echo "\n*** Running dhcp client:\n"
        $DHCP_CMD
        break
    fi
    if [ ! -d /proc/$bt_pid ]; then
        echo "\n*** Bluetooth connection died, exiting. Output:\n"
        cat $out
        exit 1
    fi
    sleep 1
    echo -n "$i "
done
{% endhighlight %}

Here is the normal output of the script:

    $ ./bt-tether.sh
    *** Waiting for bluetooth connection...1 2 3 4
    *** Bluetooth connection established:

    Network service is connected
    Interface: bnep0
    UUID: NAP (00001116-0000-1000-8000-00805f9b34fb)

    *** Running dhcp client:

    Internet Systems Consortium DHCP Client 4.2.2
    Copyright 2004-2011 Internet Systems Consortium.
    All rights reserved.
    For info, please visit https://www.isc.org/software/dhcp/

    Listening on LPF/bnep0/cc:af:78:e4:e3:ef
    Sending on   LPF/bnep0/cc:af:78:e4:e3:ef
    Sending on   Socket/fallback
    DHCPREQUEST on bnep0 to 255.255.255.255 port 67
    DHCPACK from 192.168.43.1
    bound to 192.168.43.78 -- renewal in 1520 seconds.

And here is the notification that appears on the phone screen once the
connection is established:

![](/images/bt-tether-1.png)
![](/images/bt-tether-2.png)
