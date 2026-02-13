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

    public function builderAction(
        Request $request,
        LoggerInterface $mauticLogger,
        ThemeHelper $themeHelper,
        string $objectType,
        string $objectId,
    ): Response {
        if (!in_array($objectType, self::OBJECT_TYPE, true)) {
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
            $entity = $model->getEntity((int) $objectId);
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

    public function editorStateAction(
        string $objectType,
        string $objectId,
    ): Response {
        if (!in_array($objectType, self::OBJECT_TYPE, true)) {
            throw new \Exception('Object not authorized to load custom builder', Response::HTTP_CONFLICT);
        }

        if (str_contains((string) $objectId, 'new')) {
            return $this->json(['editorState' => null]);
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
        $editorState = null;

        // `content` is expected to be an array, but depending on how it was saved
        // it may be a JSON string or a serialized value. Normalize to array first.
        if (is_string($content)) {
            $decoded = json_decode($content, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $content = $decoded;
            } else {
                $unserialized = @unserialize($content);
                if (false !== $unserialized && is_array($unserialized)) {
                    $content = $unserialized;
                }
            }
        }

        if (is_array($content)
            && isset($content['grapesjsbuilder'])
        ) {
            if (array_key_exists('editorState', $content['grapesjsbuilder'])) {
                $editorState = $content['grapesjsbuilder']['editorState'];
            } elseif (array_key_exists('projectData', $content['grapesjsbuilder'])) {
                $editorState = $content['grapesjsbuilder']['projectData'];
            }
        }

        return $this->json(['editorState' => $editorState]);
    }

    /**
     * @deprecated deprecated since version 5.0 - use mjml directly in email.html.twig
     */
    private function checkForMjmlTemplate(string $template): ?string
    {
        $twig = $this->container->get('twig');

        if ($twig->getLoader()->exists($template)) {
            return $template;
        }

        return null;
    }
}
