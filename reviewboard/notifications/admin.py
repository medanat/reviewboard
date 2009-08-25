from django.contrib import admin
from django.contrib.sites.models import Site

from reviewboard.notifications.models import Webhook


class WebhookAdmin(admin.ModelAdmin):
    fields = ('url',)

    def save_model(self, request, obj, form, change):
        if not change:
            obj.owner = Site.objects.get_current()

        obj.save()


admin.site.register(Webhook, WebhookAdmin)
