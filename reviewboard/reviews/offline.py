from django.conf import settings
from django.core.paginator import Paginator
from django.core.urlresolvers import reverse
from djblets.siteconfig.models import SiteConfiguration
from djblets.util.dates import get_latest_timestamp

from reviewboard.diffviewer.diffutils import get_diff_files, \
                                             get_enable_highlighting
from reviewboard.diffviewer.models import DiffSet
from reviewboard.offline.signals import adding_manifest_urls
from reviewboard.reviews.datagrids import DashboardDataGrid
from reviewboard.reviews.models import ReviewRequest, Review


def get_diff_viewer_urls(request, review_request):
    try:
        diffset = review_request.diffset_history.diffsets.latest()
    except DiffSet.DoesNotExist:
        return

    view_diff_url = reverse("view_diff", args=[review_request.id])

    yield { 'url': view_diff_url }
    yield { 'url': reverse("raw_diff", args=[review_request.id]) }

    files = get_diff_files(diffset, None, None,
                           get_enable_highlighting(request.user),
                           False)

    # Break the list of files into pages
    siteconfig = SiteConfiguration.objects.get_current()
    paginator = Paginator(files,
                          siteconfig.get("diffviewer_paginate_by"),
                          siteconfig.get("diffviewer_paginate_orphans"))

    for pagenum in paginator.page_range:
        yield { 'url': '%s?page=%d' % (view_diff_url, pagenum)}

    for file in files:
        yield {
            'url': '%s?index=%s&%s' % \
                   (reverse("diff_fragment", args=[review_request.id,
                                                   diffset.revision,
                                                   file['filediff'].id]),
                    file['index'],
                    settings.AJAX_SERIAL)
        }


def get_screenshot_urls(review_request):
    for screenshot in review_request.screenshots.all():
        yield { 'url': screenshot.get_absolute_url() }
        yield { 'url': screenshot.image.url }
        yield { 'url': screenshot.get_thumbnail_url() }


def get_diff_comment_urls(review_request):
    diff_fragments = {}

    for review in review_request.get_public_reviews():
        for comment in review.comments.all():
            if comment.interfilediff:
                key = "%s-%s" % (comment.filediff.id, comment.interfilediff.id)
            else:
                key = comment.filediff.id

            if key not in diff_fragments:
                diff_fragments[key] = []

            diff_fragments[key].append(str(comment.id))

    for key, ids in diff_fragments.iteritems():
        # XXX It's kinda crappy that we even have to know about the queue
        #     name and comment_container, but it's needed to prevent
        #     mismatched URLs. We have to be strict and match the JavaScript.
        params = 'queue=diff_fragments&container_prefix=comment_container&' + \
                 str(settings.AJAX_SERIAL)

        yield {
            'url': "%s?%s" % (reverse("comment_diff_fragments",
                                      args=[review_request.id, ",".join(ids)]),
                              params)
        }


def get_review_request_urls(request, review_request):
    urls = [{ 'url': review_request.get_absolute_url() }]
    urls.extend(get_diff_viewer_urls(request, review_request))
    urls.extend(get_screenshot_urls(review_request))
    urls.extend(get_diff_comment_urls(review_request))

    return urls


def add_urls_from_datagrid(urls, found_review_requests, metadata,
                           datagrid, view, group=None):
    datagrid_params = "view=%s" % view

    if group:
        datagrid_params += "&group=%s" % group

    datagrid_url = "%s?%s" % (reverse("dashboard"), datagrid_params)

    urls.append({
        'url': datagrid_url,
        'matchQuery': {
            'hasAll': datagrid_params,
        },
    })

    for obj_info in datagrid.rows:
        review_request = obj_info['object']
        assert isinstance(review_request, ReviewRequest)

        if review_request.id not in found_review_requests:
            found_review_requests[review_request.id] = True

            add_review_request_urls(datagrid.request, urls, metadata,
                                    review_request)


def get_datagrids(request):
    for view in ["incoming", "to-me", "starred"]:
        datagrid = DashboardDataGrid(request, view=view)
        yield datagrid

    for review_group in request.user.review_groups.all():
        datagrid = DashboardDataGrid(request, view="to-group",
                                     group=review_group.name)
        yield datagrid


def get_review_requests_from_datagrids(request):
    review_requests = set()

    for datagrid in get_datagrids(request):
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        datagrid.load_state()

        for obj_info in datagrid.rows:
            review_request = obj_info['object']
            assert isinstance(review_request, ReviewRequest)

            review_requests.add(review_request)

    return review_requests


def add_urls(request, urls, metadata, **kwargs):
    found_review_requests = {}

    metadata['syntax_highlighting'] = \
        get_enable_highlighting(request.user)


    # Add the base Dashboard and "/" redirect.
    urls += [
        { 'url': reverse('dashboard') },
        { 'url': settings.SITE_ROOT, 'redirect': reverse('dashboard') },
    ]

    # Start grabbing all the review requests on the first page of each
    # datagrid.
    for view in ["incoming", "to-me", "starred"]:
        datagrid = DashboardDataGrid(request, view=view)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, found_review_requests, metadata,
                               datagrid, view)

    for review_group in request.user.review_groups.all():
        datagrid = DashboardDataGrid(request, view="to-group",
                                     group=review_group.name)
        datagrid.profile_columns_field = None
        datagrid.default_columns = ["summary"]
        add_urls_from_datagrid(urls, found_review_requests, metadata,
                               datagrid, "to-group", review_group.name)


def add_manifest_urls(request, urls, **kwargs):
    #urls.append({
    #    'url': reverse('dashboard-manifest'),
    #})

    for review_request in get_review_requests_from_datagrids(request):
        urls.append({
            'url': reverse("review-request-manifest",
                           args=[review_request.id])
        })


adding_manifest_urls.connect(add_manifest_urls)
