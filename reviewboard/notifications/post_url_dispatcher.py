# The MIT License

# Copyright (c) 2009 Jeff Lindsay

# Permission is hereby granted, free of charge, to any person
# obtaining a copy of this software and associated documentation files
# (the "Software"), to deal in the Software without restriction,
# including without limitation the rights to use, copy, modify, merge,
# publish, distribute, sublicense, and/or sell copies of the Software,
# and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:

# The above copyright notice and this permission notice shall be
# included in all copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
# EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
# MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
# BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
# ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

# Taken from the first commit of Hookah, by Jeff Lindsay.
# Adapted by Helder Ribeiro to Review Board.

import logging
import os
import threading
import urllib
import urllib2


RETRIES = 3
DELAY_MULTIPLIER = 5


def post_and_retry(url, params, retry=0):
    logging.debug("Posting [%s] to %s with:\n %s", retry, url, params)

    try:
        if params:
            encoded_params = urllib.urlencode(params)
        else:
            encoded_params = None

        urllib2.urlopen(url, encoded_params)
        logging.debug("Posted to %s with:\n %s" % (url, params))
    except urllib2.HTTPError, e:
        logging.error("Error posting [%s] to %s with:\n %s", retry, url,
                      params, exc_info=e)
        if retry < RETRIES:
            retry += 1
            threading.Timer(retry * DELAY_MULTIPLIER, post_and_retry,
                            args=[url, params, retry]).start()


def dispatch(url, params):
    if url:
        threading.Thread(target=post_and_retry, args=[url, params]).start()
    else:
        raise ValueError('You must supply a URL')
