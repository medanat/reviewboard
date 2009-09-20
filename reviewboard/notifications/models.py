from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes import generic
from django.db import models
from djblets.webapi.core import MultiEncoder, MultiEncoderAdapter

from reviewboard.notifications.post_url_dispatcher import dispatch as post


class Webhook(models.Model):
    """
    Stores a URL to which a payload should be POSTed. A POST is
    dispatched through the ``dispatch()`` method, passing the payload
    as a parameter and using the URL stored in the database.
    """
    owner_type = models.ForeignKey(ContentType)
    owner_id = models.PositiveIntegerField()
    owner = generic.GenericForeignKey(ct_field="owner_type",
                                      fk_field="owner_id")

    url = models.URLField()

    def dispatch(self, payload):
        encoder = MultiEncoder()
        adapter = MultiEncoderAdapter(encoder, 'json')
        content = adapter.encode(payload)

        post(self.url, {'payload': content})

    def __unicode__(self):
        return self.url
