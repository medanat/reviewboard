from django.contrib.contenttypes.models import ContentType
from django.contrib.sites.models import Site

from reviewboard.notifications.models import Webhook
from reviewboard.reviews.models import ReviewRequest, Review, Comment
from reviewboard.reviews.signals import post_publish


def get_payload(event_data):
    """
    Returns a hash of information about the event. This a common
    language all event sinks should understand in their dispatch()
    method, each using it to generate the appropriate output (email -
    to be done -, webhook, etc.).
    """
    source_type = ContentType.objects.get_for_model(event_data['sender'])
    payload = {
        'event_name': event_data['event_type'],
        'event_source': event_data['instance'],
        'event_source_type': source_type.app_label + '.' + source_type.model,
        'user': event_data['user']
    }

    if 'changedesc' in event_data:
        payload.update({'changedesc': event_data['changedesc']})

    return payload


def post_publish_cb(**kwargs):
    owner_type = ContentType.objects.get_for_model(Site).id
    owner_id = Site.objects.get_current().id
    webhooks = Webhook.objects.filter(owner_type=owner_type, owner_id=owner_id)

    for webhook in webhooks:
        event_data = {'event_type': 'post_publish'}
        event_data.update(kwargs)
        webhook.dispatch(get_payload(event_data))


def connect_signals():
    post_publish.connect(post_publish_cb)
