import os
from time import mktime

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.sites.models import Site
from django.core.paginator import Paginator
from django.core.urlresolvers import reverse

from djblets.siteconfig.models import SiteConfiguration
from djblets.util.dates import get_latest_timestamp
from djblets.util.misc import cache_memoize

from reviewboard.diffviewer.diffutils import get_diff_files, \
                                             get_enable_highlighting
from reviewboard.diffviewer.models import DiffSet
from reviewboard.reviews.datagrids import DashboardDataGrid
from reviewboard.reviews.models import ReviewRequest, Review


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
                            "url": "%s%s?%s" % (media_prefix, path,
                                                settings.MEDIA_SERIAL),
                            "matchQuery": {
                                "hasAll": str(settings.MEDIA_SERIAL),
                            },
                        })

        return paths

    siteconfig = SiteConfiguration.objects.get_current()
    domain_method = siteconfig.get("site_domain_method")

    key = "%s-media-serial-urls-%s" % (domain_method, settings.MEDIA_SERIAL)

    return cache_memoize(key, scan_media_files)


@login_required
def manifest(request, manifest_class):
    # TODO: Move this function into ReviewRequest, once it's flexible enough.
    #       Right now it's a duplicate of what's in review_detail.
    def get_last_activity_timestamp(review_request):
        review_timestamp = 0

        if request.user.is_authenticated():
            try:
                last_draft_review = Review.objects.filter(
                    review_request=review_request,
                    user=request.user,
                    public=False).latest()
                review_timestamp = last_draft_review.timestamp
            except Review.DoesNotExist:
                pass

        # Find out if we can bail early. Generate an ETag for this.
        timestamps = [review_request.last_updated]
        draft = review_request.get_draft()

        if draft:
            timestamps.append(draft.last_updated)

        return get_latest_timestamp(timestamps)

    def add_urls_from_datagrid(urls, datagrid, view, group=None):
        datagrid.load_state()

        datagrid_params = "view=%s" % view

        if group:
            datagrid_params += "&group=%s" % group

        datagrid_url = "%s%s?%s" % (url_prefix, reverse("dashboard"),
                                    datagrid_params)

        urls.append({
            'url': datagrid_url,
            'matchQuery': {
                'hasAll': datagrid_params,
            },
        })

        highlighting = get_enable_highlighting(request.user)

        for obj_info in datagrid.rows:
            review_request = obj_info['object']
            assert isinstance(review_request, ReviewRequest)

            if review_request.id in found_review_requests:
                continue

            found_review_requests[review_request.id] = True

            # Grab the latest activity timestamp.
            # TODO: Make this common between here and review_detail.
            timestamp = get_last_activity_timestamp(review_request)

            if (not info['latest_timestamp'] or
                timestamp > info['latest_timestamp']):
                info['latest_timestamp'] = timestamp

            urls.append({
                'url': url_prefix + review_request.get_absolute_url(),
            })

            try:
                diffset = review_request.diffset_history.diffsets.latest()

                view_diff_url = url_prefix + reverse("view_diff",
                                                     args=[review_request.id])

                urls += [
                    { 'url': view_diff_url },
                    { 'url': url_prefix + reverse("raw_diff",
                                                  args=[review_request.id]) },
                ]

                files = get_diff_files(diffset, None, None, highlighting,
                                       False)

                # Break the list of files into pages
                siteconfig = SiteConfiguration.objects.get_current()
                paginator = Paginator(
                    files,
                    siteconfig.get("diffviewer_paginate_by"),
                    siteconfig.get("diffviewer_paginate_orphans"))

                for pagenum in paginator.page_range:
                    urls.append({
                        "url": "%s?page=%d" % (view_diff_url, pagenum)
                    })
            except DiffSet.DoesNotExist:
                pass

            for screenshot in review_request.screenshots.all():
                urls += [
                    { 'url': url_prefix + screenshot.get_absolute_url() },
                    { 'url': url_prefix + screenshot.image.url },
                    { 'url': url_prefix + screenshot.get_thumbnail_url() },
                ]

    info = {
        'latest_timestamp': None
    }

    found_review_requests = {}

    site = Site.objects.get_current()
    siteconfig = SiteConfiguration.objects.get_current()
    url_prefix = "%s://%s" % (siteconfig.get("site_domain_method"),
                              site.domain)

    urls = [
        { 'url': url_prefix + '/dashboard/' },
        { 'url': url_prefix + '/', 'redirect': url_prefix + '/dashboard/' },
    ]

    urls += get_media_urls()

    # Start grabbing all the review requests on the first page of each
    # datagrid.
    for view in ["incoming", "to-me", "starred"]:
        datagrid = DashboardDataGrid(request, view=view)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, datagrid, view)

    for review_group in request.user.review_groups.all():
        datagrid = DashboardDataGrid(request, view="to-group",
                                     group=review_group.name)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, datagrid, "to-group", review_group.name)

    version = "%s-%s-%s" % (request.user.username, settings.AJAX_SERIAL,
                            settings.MEDIA_SERIAL)

    if info['latest_timestamp']:
        version += "-%d" % mktime(info['latest_timestamp'].timetuple())

    # TODO: ETags
    return manifest_class(request, version, urls)
