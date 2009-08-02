import os
from time import mktime

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.sites.models import Site
from django.core.urlresolvers import reverse
from djblets.siteconfig.models import SiteConfiguration
from djblets.util.misc import cache_memoize

from reviewboard.offline.manifests import ManifestResponse
from reviewboard.offline.signals import adding_manifest_urls


VALID_EXTENSIONS = [".js", ".css", ".htc", ".png", ".gif", ".jpg"]


def get_media_urls():
    def scan_media_files():
        media_prefix = settings.MEDIA_URL

        if not media_prefix.startswith("http"):
            site = Site.objects.get_current()
            media_prefix = "%s://%s%s" % (domain_method, site.domain,
                                          media_prefix)

        paths = []

        for media_dir in settings.MEDIA_SERIAL_DIRS:
            media_path = os.path.join(settings.MEDIA_ROOT, media_dir)

            for root, dirs, files in os.walk(media_path):
                for name in files:
                    if (not name.startswith(".") and
                        os.path.splitext(name)[1] in VALID_EXTENSIONS):

                        path = os.path.relpath(os.path.join(root, name),
                                               settings.MEDIA_ROOT)
                        paths.append({
                            'url': '%s%s?%s' % (media_prefix, path,
                                                settings.MEDIA_SERIAL)
                        })

        return paths

    siteconfig = SiteConfiguration.objects.get_current()
    domain_method = siteconfig.get("site_domain_method")

    key = "%s-media-serial-urls-%s" % (domain_method, settings.MEDIA_SERIAL)

    return cache_memoize(key, scan_media_files)


@login_required
def manifest(request, manifest_class):
    metadata = {
        'latest_timestamp': None,
    }

    site = Site.objects.get_current()
    siteconfig = SiteConfiguration.objects.get_current()
    url_prefix = "%s://%s" % (siteconfig.get("site_domain_method"),
                              site.domain)

    urls = get_media_urls()

    adding_manifest_urls.send(sender=None, request=request, urls=urls,
                              metadata=metadata)

    version = "%s-%s-%s" % (request.user.username, settings.AJAX_SERIAL,
                            settings.MEDIA_SERIAL)

    if metadata['latest_timestamp']:
        version += "-%d" % mktime(metadata['latest_timestamp'].timetuple())

    # TODO: ETags
    return manifest_class(request, version, url_prefix, urls)


@login_required
def manifests(request):
    urls = [{
        'url': reverse('media-manifest'),
    }]

    adding_manifest_urls.send(sender=None, request=request, urls=urls)

    return ManifestResponse(request, urls)


@login_required
def media_manifest(request):
    return ManifestResponse(request, get_media_urls(), settings.MEDIA_SERIAL)
