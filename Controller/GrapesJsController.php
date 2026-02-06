<?php

declare(strict_types=1);

namespace MauticPlugin\GrapesJsBuilderBundle\Controller;

use Mautic\CoreBundle\Controller\CommonController;
use Mautic\CoreBundle\Helper\EmojiHelper;
use Mautic\CoreBundle\Helper\InputHelper;
use Mautic\CoreBundle\Helper\ThemeHelper;
use Mautic\EmailBundle\Entity\Email;
use Mautic\PageBundle\Entity\Page;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

class GrapesJsController extends CommonController
{
    public const OBJECT_TYPE = ['email', 'page'];

    /**
     * Activate the custom builder.
     *
     * @param string $objectType
     * @param int    $objectId
     *
     * @return Response
     */
    public function builderAction(
        Request $request,
        LoggerInterface $mauticLogger,
        ThemeHelper $themeHelper,
        $objectType,
        $objectId,
    ) {
        if (!in_array($objectType, self::OBJECT_TYPE)) {
            throw new \Exception('Object not authorized to load custom builder', Response::HTTP_CONFLICT);
        }

        /** @var \Mautic\EmailBundle\Model\EmailModel|\Mautic\PageBundle\Model\PageModel $model */
        $model      = $this->getModel($objectType);
        $aclToCheck = 'email:emails:';

        if ('page' === $objectType) {
            $aclToCheck = 'page:pages:';
        }

        // permission check
        if (str_contains((string) $objectId, 'new')) {
            $isNew = true;

            if (!$this->security->isGranted($aclToCheck.'create')) {
                return $this->accessDenied();
            }

            /** @var Email|Page $entity */
            $entity = $model->getEntity();
            $entity->setSessionId($objectId);
        } else {
            /** @var Email|Page $entity */
            $entity = $model->getEntity($objectId);
            $isNew  = false;

            if (null == $entity
                || !$this->security->hasEntityAccess(
                    $aclToCheck.'viewown',
                    $aclToCheck.'viewother',
                    $entity->getCreatedBy()
                )
            ) {
                return $this->accessDenied();
            }
        }

        $type         = 'html';
        $template     = InputHelper::clean($request->query->get('template'));
        $resetProject = $request->query->getBoolean('resetProject', false);
        if (!$template) {
            $mauticLogger->warning('Grapesjs: no template in query');

            return $this->json(false);
        }
        $templateName = '@themes/'.$template.'/html/'.$objectType;
        $content      = $resetProject ? [] : $entity->getContent();

        // Check for MJML template
        // @deprecated - use mjml directly in email.html.twig
        if ($logicalName = $this->checkForMjmlTemplate($templateName.'.mjml.twig')) {
            $type        = 'mjml';
        } else {
            $logicalName = $themeHelper->checkForTwigTemplate($templateName.'.html.twig');
        }

        // Replace short codes to emoji
        $content = array_map(fn ($text) => EmojiHelper::toEmoji($text, 'short'), $content);

        $renderedTemplate =  $this->renderView(
            $logicalName,
            [
                'isNew'     => $isNew,
                'content'   => $content,
                $objectType => $entity,
                'template'  => $template,
                'basePath'  => $request->getBasePath(),
            ]
        );

        if (str_contains($renderedTemplate, '<mjml>')) {
            $type = 'mjml';
        }

        $renderedTemplateHtml = ('html' === $type) ? $renderedTemplate : '';
        $renderedTemplateMjml = ('mjml' === $type) ? $renderedTemplate : '';

        return $this->render(
            '@GrapesJsBuilder/Builder/template.html.twig',
            [
                'templateHtml' => $renderedTemplateHtml,
                'templateMjml' => $renderedTemplateMjml,
            ]
        );
    }

    public function projectAction(
        Request $request,
        LoggerInterface $mauticLogger,
        $objectType,
        $objectId,
    ) {
        if (!in_array($objectType, self::OBJECT_TYPE)) {
            throw new \Exception('Object not authorized to load custom builder', Response::HTTP_CONFLICT);
        }

        if (str_contains((string) $objectId, 'new')) {
            return $this->json(['projectData' => null]);
        }

        $model      = $this->getModel($objectType);
        $aclToCheck = 'email:emails:';

        if ('page' === $objectType) {
            $aclToCheck = 'page:pages:';
        }

        /** @var Email|Page|null $entity */
        $entity = $model->getEntity((int) $objectId);

        if (null === $entity
            || !$this->security->hasEntityAccess(
                $aclToCheck.'viewown',
                $aclToCheck.'viewother',
                $entity->getCreatedBy()
            )
        ) {
            return $this->accessDenied();
        }

        $content     = $entity->getContent();
        $projectData = null;

        if (is_array($content)
            && isset($content['grapesjsbuilder'])
            && array_key_exists('projectData', $content['grapesjsbuilder'])
        ) {
            $projectData = $content['grapesjsbuilder']['projectData'];
        }

        return $this->json(['projectData' => $projectData]);
    }

    public function resetProjectAction(
        Request $request,
        LoggerInterface $mauticLogger,
        $objectType,
        $objectId,
    ) {
        if (!in_array($objectType, self::OBJECT_TYPE)) {
            throw new \Exception('Object not authorized to load custom builder', Response::HTTP_CONFLICT);
        }

        if (str_contains((string) $objectId, 'new')) {
            return $this->json(['success' => true]);
        }

        $model      = $this->getModel($objectType);
        $aclToCheck = 'email:emails:';

        if ('page' === $objectType) {
            $aclToCheck = 'page:pages:';
        }

        /** @var Email|Page|null $entity */
        $entity = $model->getEntity((int) $objectId);

        if (null === $entity
            || !$this->security->hasEntityAccess(
                $aclToCheck.'viewown',
                $aclToCheck.'viewother',
                $entity->getCreatedBy()
            )
        ) {
            return $this->accessDenied();
        }

        $content = $entity->getContent();
        if (!is_array($content)) {
            $content = [];
        }

        if (isset($content['grapesjsbuilder'])) {
            unset($content['grapesjsbuilder']['projectData']);
            unset($content['grapesjsbuilder']['version']);
            unset($content['grapesjsbuilder']['updatedAt']);

            if (empty($content['grapesjsbuilder'])) {
                unset($content['grapesjsbuilder']);
            }
        }

        $entity->setContent($content);
        $model->getRepository()->saveEntity($entity);

        return $this->json(['success' => true]);
    }

    /**
     * @deprecated deprecated since version 5.0 - use mjml directly in email.html.twig
     */
    private function checkForMjmlTemplate($template)
    {
        $twig = $this->container->get('twig');

        if ($twig->getLoader()->exists($template)) {
            return $template;
        }

        return null;
    }
}
